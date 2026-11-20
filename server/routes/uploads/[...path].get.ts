// server/routes/uploads/[...path].get.ts
// 站内上传图片的读取路由：GET /uploads/dishes/<uuid>.<ext>
//
// 为什么不用 public/：public 目录在构建时被快照进产物，运行期写进去的文件不会被 Nitro 提供；
// 上传是运行期行为，必须由服务端路由从磁盘流式返回。
//
// 安全边界：
// - 只暴露 dishes 下一层的文件名，拒绝多级路径与 ..，防止读到目录外；
// - 只返回白名单扩展名，避免把上传目录里的其它文件当静态资源泄露；
// - 文件名是 UUID 且内容不可变，可以给 immutable 长缓存，减轻手机端重复请求。

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'path') ?? ''
  const segments = raw.split('/')

  // 结构固定为 dishes/<file>，任何多余层级都视为不合法（404 而不是 403，不暴露目录结构）
  if (segments.length !== 2 || segments[0] !== 'dishes') {
    throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  }

  const fileName = segments[1] ?? ''
  if (!fileName || fileName.includes('..') || fileName.includes('\\')) {
    throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  }

  const ext = extname(fileName).toLowerCase()
  const contentType = IMAGE_CONTENT_TYPES[ext]
  if (!contentType) {
    throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  }

  const fullPath = join(uploadRootDir(), 'dishes', fileName)
  // stat 而不是直接 createReadStream：先确认是文件，才能区分 404 与正常的空文件
  const info = await stat(fullPath).catch(() => null)
  if (!info?.isFile()) {
    throw createError({ statusCode: 404, statusMessage: '图片不存在' })
  }

  setResponseHeader(event, 'Content-Type', contentType)
  setResponseHeader(event, 'Content-Length', info.size)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return sendStream(event, createReadStream(fullPath))
})
