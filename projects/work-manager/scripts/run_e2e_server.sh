#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kmc-e2e.XXXXXX")"
mkdir -p "$E2E_ROOT/10_프로젝트" "$E2E_ROOT/20_완료" "$E2E_ROOT/00_운영" "$E2E_ROOT/data"

echo "E2E 격리 루트: $E2E_ROOT"
echo "종료 후 검토를 위해 자동 삭제하지 않습니다."
cd "$SCRIPT_DIR"
export KMC_E2E_MODE=1
export KMC_BASE_DIR="$E2E_ROOT"
export KMC_PROJECTS_DIR="$E2E_ROOT/10_프로젝트"
export KMC_COMPLETED_DIR="$E2E_ROOT/20_완료"
export KMC_OPERATIONS_FILE="$E2E_ROOT/00_운영/김명규크리에이티브_운영대장.xlsx"
export KMC_DATA_DIR="$E2E_ROOT/data"
export KMC_DB_PATH="$E2E_ROOT/data/app.db"
export KMC_DISABLE_EXTERNAL_SERVICES=1
export STARTUP_SYNC=0
export APP_HOST=127.0.0.1
export APP_PORT=5011
export ENABLE_CORS=0
exec .venv/bin/python app.py
