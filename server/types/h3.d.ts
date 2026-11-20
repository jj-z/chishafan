// 扩展 H3EventContext，让中间件写入的 requestId 在接口里可直接读取且类型安全。
// 用模块声明而不是每个接口里强转 any（见 docs/pitfalls.md #5 的同类做法）。

declare module 'h3' {
  interface H3EventContext {
    /** 请求链路 id，由 server/middleware/request-log.ts 写入并回传 x-request-id。 */
    requestId?: string
  }
}

export {}
