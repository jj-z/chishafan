// Prisma CLI 配置（Prisma 7 起由 prisma.config.ts 取代 schema 内的 datasource.url）
// dotenv 必须显式引入：Prisma 7 不再自动读取 .env，缺了它 DATABASE_URL 会是 undefined。
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  // 指向 prisma 目录：Prisma 会递归扫描其中所有 .prisma 文件。
  // 因此 generator/datasource 放在 prisma/schema.prisma，业务模型放在 prisma/models/。
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
