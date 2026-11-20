// 批量压缩历史上传的菜品图（一次性维护脚本，不参与运行时）。
//
// 用法：
//   npm run images:compress -- --dry-run   # 只预览，不写盘
//   npm run images:compress                # 实际覆盖
//   npm run images:compress -- --dir /path/to/dishes
//
// 设计取舍：
// - 保持原文件名与格式：数据库存的是 /uploads/dishes/<uuid>.<ext>，改名就得同步改库，
//   风险大于收益；同格式重编码已经能拿到大部分收益。
// - 先写临时文件再原子替换：压缩中途失败不会留下半张损坏的图。
// - 只有「更小」才替换：已经优化过的图重新编码可能反而变大，宁可跳过。
// - sharp 只作为 devDependency（见 package.json），Docker runner 只拷 .output，
//   生产镜像不会因此变重。

import { readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import sharp from 'sharp'

/** 与前端 compressImage 保持一致：长边 1600px，覆盖详情页 2 倍屏。 */
const MAX_EDGE = 1600
const JPEG_QUALITY = 82
const WEBP_QUALITY = 82
/** PNG 走调色板量化（quality 0-100），对菜品照片通常能省 50% 以上。 */
const PNG_PALETTE_QUALITY = 88

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

interface Options {
  dir: string
  dryRun: boolean
}

/**
 * 解析命令行参数。
 * 目录优先级：--dir > UPLOAD_DIR/dishes > .data/uploads/dishes，
 * 与 server/utils/upload.ts 的目录约定保持一致。
 */
function parseArgs(argv: string[]): Options {
  let dir = process.env.UPLOAD_DIR
    ? join(resolve(process.env.UPLOAD_DIR), 'dishes')
    : resolve('.data/uploads/dishes')
  let dryRun = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--dir') {
      const value = argv[i + 1]
      if (!value) throw new Error('--dir 后面需要跟目录路径')
      dir = resolve(value)
      i += 1
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }

  return { dir, dryRun }
}

function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`
}

/**
 * 按原格式重新编码一张图。
 * 统一先 rotate()：它会按 EXIF 方向把手机照片转正并清掉方向标记，
 * 否则压缩后的图在部分浏览器里会躺倒。
 */
async function reencode(file: string): Promise<Buffer> {
  const ext = extname(file).toLowerCase()
  const pipeline = sharp(file, { failOn: 'none' }).rotate()
  const meta = await pipeline.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0

  if (Math.max(width, height) > MAX_EDGE) {
    pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
  }

  if (ext === '.png') {
    return pipeline
      .png({ compressionLevel: 9, effort: 10, palette: true, quality: PNG_PALETTE_QUALITY })
      .toBuffer()
  }
  if (ext === '.webp') {
    return pipeline.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer()
  }
  return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true }).toBuffer()
}

interface RowResult {
  name: string
  before: number
  after: number
  replaced: boolean
  reason?: string
}

/** 处理单张图：编码、比较、原子替换；返回结果供汇总。 */
async function compressOne(file: string, dryRun: boolean): Promise<RowResult> {
  const info = await stat(file)
  const before = info.size
  const output = await reencode(file)

  if (output.length >= before) {
    return {
      name: file.split(/[\\/]/).pop() ?? file,
      before,
      after: before,
      replaced: false,
      reason: '收益为负，保留原图',
    }
  }

  if (!dryRun) {
    // 先写同目录临时文件，再 rename 覆盖：rename 在同分区是原子操作。
    const temp = `${file}.tmp-${process.pid}`
    await writeFile(temp, output)
    try {
      await rename(temp, file)
    } catch (error) {
      await unlink(temp).catch(() => {})
      throw error
    }
  }

  return { name: file.split(/[\\/]/).pop() ?? file, before, after: output.length, replaced: true }
}

async function main() {
  const { dir, dryRun } = parseArgs(process.argv.slice(2))
  const entries = await readdir(dir).catch(() => null)
  if (!entries) {
    console.error(`目录不存在：${dir}`)
    process.exitCode = 1
    return
  }

  const files = entries
    .filter((name) => IMAGE_EXTS.has(extname(name).toLowerCase()))
    .map((name) => join(dir, name))

  if (files.length === 0) {
    console.log(`没有需要处理的图片：${dir}`)
    return
  }

  console.log(`${dryRun ? '[预览] ' : ''}开始处理 ${files.length} 张图片：${dir}\n`)

  const results: RowResult[] = []
  for (const file of files) {
    try {
      const result = await compressOne(file, dryRun)
      results.push(result)
      const delta = result.before - result.after
      const percent = result.before > 0 ? Math.round((delta / result.before) * 100) : 0
      console.log(
        result.replaced
          ? `压缩 ${result.name}  ${formatKb(result.before)} -> ${formatKb(result.after)} (-${percent}%)`
          : `跳过 ${result.name}  ${formatKb(result.before)}（${result.reason}）`,
      )
    } catch (error) {
      console.error(`失败 ${file}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const replaced = results.filter((row) => row.replaced)
  const saved = replaced.reduce((sum, row) => sum + (row.before - row.after), 0)
  console.log(
    `\n完成：${replaced.length}/${results.length} 张被压缩，节省 ${formatKb(saved)}${dryRun ? '（预览模式未写盘）' : ''}`,
  )
}

await main()
