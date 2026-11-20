// server/utils/db.ts
import { PrismaClient } from '../../shared/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// 1. 定义一个 create 函数
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

// 2. 声明全局变量的类型，但换个名字避开冲突（比如用 prismaClient），或者直接在 globalThis 上断言
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

// 3. 导出
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// 4. 在开发环境下缓存
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
