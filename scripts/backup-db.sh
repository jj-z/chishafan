#!/usr/bin/env bash
# 数据库每日备份（P2-23）。
# 用法：DATABASE_URL='postgresql://...' ./scripts/backup-db.sh
# 可选：BACKUP_DIR（默认 ./backups）、KEEP_DAYS（默认 7）。
# 建议放进 crontab：0 3 * * * cd /srv/chishafan && DATABASE_URL=... ./scripts/backup-db.sh

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "缺少 DATABASE_URL" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/chishafan-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

# -Fc 使用自定义压缩格式，体积小且支持 pg_restore 并行恢复。
pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" -f "$FILE"

# 生成校验值，恢复前可先核对文件是否损坏。
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" > "${FILE}.sha256"
fi

# 只保留最近 KEEP_DAYS 天的备份，避免磁盘被占满。
find "$BACKUP_DIR" -name 'chishafan-*.dump*' -type f -mtime +"$KEEP_DAYS" -delete

echo "备份完成：$FILE"
