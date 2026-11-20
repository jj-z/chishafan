// server/utils/date.ts
// 「只关心日期」的场景专用的小工具。
//
// 背景（新手容易踩的坑）：DiningHistory.eatenOn 是 PostgreSQL 的 date 列（@db.Date），
// Prisma 会把这个 Date 按 UTC 截成日期后入库。如果直接 new Date(y, m, d) 得到的是
// 本地零点，在 UTC+8 会变成「前一天 16:00Z」，落库就少了一天。
// 所以统一用下面这个函数：取本地日历上的年/月/日，再构造成 UTC 零点。

/** 返回「本地日历的今天」对应的 UTC 零点 Date，可直接写入 @db.Date 列。 */
export function todayDateOnly(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/**
 * 把从 @db.Date 读出来的 Date 转成 YYYY-MM-DD。
 * 因为 Prisma 读出的是 UTC 零点，直接用 toISOString 截前 10 位就是存储日期，
 * 不受服务器时区影响。
 */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10)
}
