// 菜品图上传前的浏览器端压缩（DISH-07 的补充，不改变服务端存储结构）。
//
// 为什么放在前端：项目明确不引入 sharp / jimp 这类图像处理库（见 docs/tech-stack.md），
// 服务端只负责魔数与大小校验。浏览器自带 Canvas 编码能力，压缩在管理员上传时完成一次，
// 之后所有访客都能少下载几百 KB，直接缓解 3M 带宽的短板。
//
// 策略：
// - 长边缩到 1600px（详情页 2 倍屏够用），最大不超过 3 轮；
// - 统一输出 WebP（保留 PNG 透明度），质量 0.82 起，超过 400KB 就降质量；
// - 质量降到 0.55 仍超标，再缩小 20% 尺寸重来；
// - 任何一步失败或不划算（原图本来就小、浏览器不支持 WebP 编码）都返回原图，
//   保证「压缩」永远不会阻断上传。

/** 只处理服务端白名单内的格式；GIF/SVG 原样交给服务端拒绝，避免前端偷偷改类型。 */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** 长边上限：卡片宽约 400px，详情页约 800px，1600px 覆盖 2 倍屏且留出裁切余量。 */
const MAX_EDGE = 1600

/** 单张目标体积：3M 带宽下约 1 秒可下载完，兼顾清晰度与首屏速度。 */
const TARGET_BYTES = 400 * 1024

const INITIAL_QUALITY = 0.82
const MIN_QUALITY = 0.55

/** 尺寸下限：再往下缩会明显糊，宁可接受略超目标体积。 */
const MIN_EDGE = 900

export interface CompressedImage {
  /** 真正要上传的文件；跳过压缩时就是原文件。 */
  file: File
  originalBytes: number
  compressedBytes: number
  /** 压缩后的像素尺寸；跳过压缩时为 0（不额外解码只是为了拿尺寸）。 */
  width: number
  height: number
  /** 是否发生了实际压缩。 */
  compressed: boolean
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/**
 * 把文件解码成可绘制对象。
 * 优先 createImageBitmap：它支持 imageOrientation，能按 EXIF 把 iPhone 竖拍照片转正；
 * 老浏览器不支持时退回 <img>，此时方向由浏览器自行处理。
 */
async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // 解码失败或参数不被支持：继续走 <img> 兜底
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = url
    })
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => {},
    }
  } finally {
    // 解码完成后字节已进入内存，可以立即释放 blob URL，避免泄漏。
    URL.revokeObjectURL(url)
  }
}

/** canvas.toBlob 的回调式 API 包一层 Promise，方便按质量档位循环重试。 */
function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

/**
 * 压缩一张待上传的菜品图。
 * 输入输出都是 File，调用方只需要把返回的 file 塞进 FormData，不需要关心格式变化。
 * 函数不抛错：任何异常都降级为原图，上传流程不会被压缩逻辑阻断。
 */
export async function compressImage(
  file: File,
  overrides: { maxEdge?: number; targetBytes?: number } = {},
): Promise<CompressedImage> {
  const originalBytes = file.size
  const maxEdge = overrides.maxEdge ?? MAX_EDGE
  const targetBytes = overrides.targetBytes ?? TARGET_BYTES
  const skipped: CompressedImage = {
    file,
    originalBytes,
    compressedBytes: originalBytes,
    width: 0,
    height: 0,
    compressed: false,
  }

  if (!ALLOWED_TYPES.has(file.type)) return skipped

  let decoded: DecodedImage
  try {
    decoded = await decode(file)
  } catch {
    return skipped
  }

  try {
    if (!decoded.width || !decoded.height) return skipped

    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height))
    let width = Math.max(1, Math.round(decoded.width * scale))
    let height = Math.max(1, Math.round(decoded.height * scale))

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return skipped

      // 高质量降采样：缩小图片时默认的双线性插值会明显发糊，这里显式开高质量。
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(decoded.source, 0, 0, width, height)

      let quality = INITIAL_QUALITY
      let blob = await encode(canvas, quality)
      // 浏览器不支持 WebP 编码时 toBlob 会回退成 PNG，体积可能反而变大，直接放弃压缩。
      if (!blob || blob.type !== 'image/webp') return skipped

      while (blob.size > targetBytes && quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.12)
        blob = await encode(canvas, quality)
        if (!blob || blob.type !== 'image/webp') return skipped
      }

      // 原图本来就不大，重新编码反而更大：保留原图，避免浪费一次上传体积。
      if (blob.size >= originalBytes && scale === 1) return skipped

      // 已达到目标，或尺寸已到下限（继续缩会糊），采用当前结果。
      if (blob.size <= targetBytes || width <= MIN_EDGE) {
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'dish'
        return {
          file: new File([blob], `${baseName}.webp`, {
            type: 'image/webp',
            lastModified: Date.now(),
          }),
          originalBytes,
          compressedBytes: blob.size,
          width,
          height,
          compressed: true,
        }
      }

      // 质量已到底仍超标：缩小 20% 尺寸再来一轮。
      width = Math.max(1, Math.round(width * 0.8))
      height = Math.max(1, Math.round(height * 0.8))
    }

    return skipped
  } finally {
    decoded.release()
  }
}
