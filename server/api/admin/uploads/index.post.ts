// server/api/admin/uploads/index.post.ts
// 后台上传菜品图：POST /api/admin/uploads（multipart/form-data，字段名 file）。
//
// 只允许管理员调用：上传会写磁盘，是最容易被刷的接口之一，必须先鉴权再解析 body。
// 返回站内相对路径 /uploads/dishes/<uuid>.<ext>，由后台表单写进 dish.imageUrl。

import { adminUploadResultSchema } from '../../../../shared/schemas/admin'
import { MAX_IMAGE_BYTES, saveDishImage } from '../../../utils/upload'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  // Content-Length 只用于「提前拒绝」：解析 multipart 会把整个 body 读进内存，
  // 等读完再判断大小已经没有意义。分块传输时该头可能缺失，所以 saveDishImage
  // 里仍按 Buffer 实际长度再校验一次，两层都要有。
  const declaredLength = Number(getHeader(event, 'content-length') ?? 0)
  if (declaredLength > MAX_IMAGE_BYTES + 8 * 1024) {
    throw createError({ statusCode: 413, statusMessage: '图片不能超过 5MB' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.data.length > 0)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: '请选择要上传的图片' })
  }

  const saved = await saveDishImage(file.data)
  return assertResponse(adminUploadResultSchema, saved, '上传图片')
})
