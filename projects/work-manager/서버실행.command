#!/bin/bash
# Finder에서 더블클릭해 작업관리 웹 서버를 실행하는 파일

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

exec "$APP_DIR/run.sh"
