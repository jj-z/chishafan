// shared/types/auth.d.ts
// 扩展 nuxt-auth-utils 的 UserSession 类型。
// 这个文件是模块声明，不是运行时代码，纯类型用途。

declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    nickname: string | null
    role: 'USER' | 'ADMIN'
    /**
     * 会话版本（AUTH-12）：登录时写入，受保护接口与数据库比对。
     * 可选是因为升级前签发的旧 cookie 不含该字段，服务端按 0 处理。
     */
    sessionVersion?: number
  }
}

export {}
