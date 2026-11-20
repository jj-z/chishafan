#!/usr/bin/env bash
# 数据库每日备份（P2-23）。
# 用法：在仓库根目录执行 ./scripts/backup-db.sh
#   - 宿主机装了 pg_dump：读取 DATABASE_URL 导出；
#   - 宿主机没装 pg_dump：自动通过 `docker compose exec db` 导出（Docker 部署的推荐方式）。
# 可选：BACKUP_DIR（默认 ./backups）、KEEP_DAYS（默认 7）。
# 建议放进 crontab：0 3 * * * cd /srv/chishafan && ./scripts/backup-db.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/chishafan-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

# 优先用本机 pg_dump；线上 Docker 部署通常没装 PostgreSQL 客户端，
# 此时走容器更省事：连接信息直接复用容器内的 POSTGRES_USER / POSTGRES_DB。
if command -v pg_dump >/dev/null 2>&1; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "本机有 pg_dump，但缺少 DATABASE_URL" >&2
    exit 1
  fi
  # -Fc 使用自定义压缩格式，体积小且支持 pg_restore 并行恢复。
  pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" -f "$FILE"
elif command -v docker >/dev/null 2>&1 && docker compose ps db >/dev/null 2>&1; then
  # -T 关闭伪终端：-Fc 是二进制流，必须直接写进文件，不能经过终端转换。
  docker compose exec -T db pg_dump -Fc --no-owner --no-privileges \
    -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-chishafan}" > "$FILE"
else
  echo "未找到 pg_dump，也没有可用的 docker compose db 服务" >&2
  echo "请在仓库根目录执行，或先安装 postgresql-client" >&2
  exit 1
fi

# 生成校验值，恢复前可先核对文件是否损坏。
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" > "${FILE}.sha256"
fi

# 只保留最近 KEEP_DAYS 天的备份，避免磁盘被占满。
find "$BACKUP_DIR" -name 'chishafan-*.dump*' -type f -mtime +"$KEEP_DAYS" -delete

echo "备份完成：$FILE"
