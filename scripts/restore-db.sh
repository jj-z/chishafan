#!/usr/bin/env bash
# 数据库恢复演练（P2-23）。
# 用法：CONFIRM_RESTORE=yes ./scripts/restore-db.sh backups/chishafan-xxx.dump
#   本机有 pg_restore 时读 DATABASE_URL；没有时自动通过 `docker compose exec db` 恢复。
#
# 安全约束：
# 1. 必须显式设置 CONFIRM_RESTORE=yes，防止误操作把生产库覆盖；
# 2. 恢复前必须停止所有写入（停应用或切只读），否则恢复期间的新数据会丢失；
# 3. --clean --if-exists 会删除同名对象，因此建议先在临时库演练（见 README）。

set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "用法：CONFIRM_RESTORE=yes $0 <备份文件>" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "拒绝执行：请确认已停止写入并设置 CONFIRM_RESTORE=yes" >&2
  exit 1
fi

if [[ -f "${FILE}.sha256" ]] && command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check "${FILE}.sha256"
fi

if command -v pg_restore >/dev/null 2>&1; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "本机有 pg_restore，但缺少 DATABASE_URL" >&2
    exit 1
  fi
  pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "$FILE"
elif command -v docker >/dev/null 2>&1 && docker compose ps db >/dev/null 2>&1; then
  # -T 关闭伪终端，备份文件从 stdin 以二进制原样送进容器。
  docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges \
    -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-chishafan}" < "$FILE"
else
  echo "未找到 pg_restore，也没有可用的 docker compose db 服务" >&2
  echo "请在仓库根目录执行，或先安装 postgresql-client" >&2
  exit 1
fi

echo "恢复完成。请执行 npx prisma migrate status 并访问 /api/health 复核。"
