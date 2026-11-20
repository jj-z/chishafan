// server/utils/upload.ts
// 菜品图片上传的公共约定：目录解析、类型白名单、魔数校验、文件落盘与旧文件清理。
//
// 为什么不引 multer / sharp / AWS SDK：当前只做「单张菜品图原样存档」，
// node:fs + node:crypto 足够；新增原生依赖会让 Docker 构建变重，也不在本项目技术栈内。
//
// 安全边界（上传接口是写磁盘的攻击面）：
// - 只认文件头魔数，不信任扩展名与 Content-Type（两者都可伪造）；
// - 白名单只有 JPG / PNG / WebP，明确拒绝 SVG（SVG 内可执行脚本，等同 XSS）；
// - 保存名用 UUID，绝不使用客户端文件名（防路径穿越与覆盖同名文件）。

import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** 单个文件上限 5MB：菜品图在卡片/详情最多占一屏，再大只会拖慢移动端首屏。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** 对外访问前缀；数据库里存相对路径，前端可以直接当 src 使用，换域名不需要迁移数据。 */
export const DISH_IMAGE_URL_PREFIX = '/uploads/dishes'

/**
 * 上传根目录。
 * 默认 .data/uploads（已在 .gitignore 内）；Docker 部署时通过 UPLOAD_DIR 指到持久化卷，
 * 否则容器重建后图片全部丢失。
 */
export function uploadRootDir(): string {
  return resolve(process.env.UPLOAD_DIR || '.data/uploads')
}

/** 菜品图目录。按业务分子目录，将来头像等其它图片可以并列存放而不互相污染。 */
export function dishImageDir(): string {
  return join(uploadRootDir(), 'dishes')
}

interface ImageKind {
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  ext: 'jpg' | 'png' | 'webp'
}

/**
 * 按文件头判断真实图片格式（魔数检测）。
 * 只比对固定偏移的字节签名，不需要解码整张图，代价是常数级。
 */
function detectImageKind(data: Buffer): ImageKind | null {
  // JPEG：FF D8 FF 是 SOI + 首个 marker 的固定开头
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  // PNG：8 字节固定签名
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { mime: 'image/png', ext: 'png' }
  }
  // WebP：RIFF 容器头 + 偏移 8 处的 WEBP 标识
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

/** 保存一张菜品图，返回可直接写进 dish.imageUrl 的站内路径。 */
export async function saveDishImage(data: Buffer): Promise<{ url: string; fileName: string }> {
  if (data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: '上传内容为空' })
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: '图片不能超过 5MB' })
  }

  const kind = detectImageKind(data)
  if (!kind) {
    throw createError({ statusCode: 400, statusMessage: '只支持 JPG / PNG / WebP 图片' })
  }

  const dir = dishImageDir()
  await mkdir(dir, { recursive: true })
  const fileName = `${randomUUID()}.${kind.ext}`
  await writeFile(join(dir, fileName), data)

  return { url: `${DISH_IMAGE_URL_PREFIX}/${fileName}`, fileName }
}

/**
 * 删除站内上传的图片文件（换图/删菜时调用）。
 * 只处理 /uploads/dishes/ 前缀：外链属于第三方资源，不能也不该由本站删除。
 * 文件名只允许纯名字，出现分隔符或 .. 直接放弃删除——数据库值被篡改时不能让它删到目录外。
 */
export async function removeDishImageFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(`${DISH_IMAGE_URL_PREFIX}/`)) return

  const fileName = url.slice(DISH_IMAGE_URL_PREFIX.length + 1)
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    return
  }

  // 文件可能已被手工删除：清理失败不影响主流程，吞掉错误即可。
  await unlink(join(dishImageDir(), fileName)).catch(() => {})
}

/** 读取文件时用扩展名映射 Content-Type；只可能来自上面白名单生成的文件名。 */
export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
