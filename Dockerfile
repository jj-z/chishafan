# 生产镜像（P2-18）。
# 分三阶段：deps 装依赖 → build 生成 Prisma Client 与 Nitro 产物 → runner 只带产物运行。
# 迁移不放在启动脚本里：多实例同时 `migrate deploy` 会抢锁，迁移应由 compose 的
# 一次性 migrate 服务或发布流水线单独执行（见 docker-compose.yml）。

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci 会触发 postinstall（nuxt prepare），此时还没有源码，因此先只装依赖。
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma Client 生成到 shared/generated，Nitro 构建时会一起打包进 .output。
RUN npx prisma generate && npm run build

# 迁移镜像：保留 devDependencies 里的 prisma CLI，供 compose 一次性服务使用。
FROM build AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# 以非 root 用户运行，降低容器逃逸后的影响面。
RUN useradd --system --uid 1001 nuxt
COPY --from=build /app/.output ./.output

# 上传目录必须先建好并 chown 给运行用户：compose 具名卷首次挂载时属主是 root，
# 非 root 的 nuxt 写不进去，后台上传会直接 500。
RUN mkdir -p /app/.data/uploads && chown -R nuxt:nuxt /app/.data

USER nuxt
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
