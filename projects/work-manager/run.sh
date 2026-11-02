#!/bin/bash
set -euo pipefail
# 김명규크리에이티브 작업관리 웹 애플리케이션 실행 스크립트 (macOS)

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd -- "$DIR"
VENV="$DIR/.venv"
source "$DIR/scripts/dependency_stamp.sh"

# 가상환경 확인
if [ ! -x "$VENV/bin/python" ]; then
    echo "가상환경(.venv) 생성 중..."
    python3 -m venv "$VENV"
    NEED_INSTALL=1
else
    NEED_INSTALL=0
    if dependency_install_needed "$DIR" "$VENV"; then NEED_INSTALL=1; fi
fi

if [ "$NEED_INSTALL" -eq 1 ]; then
    echo "검증된 Python 의존성 설치 중..."
    if ! install_dependencies_and_stamp "$DIR" "$VENV"; then
        echo "의존성 설치 실패: stamp를 갱신하지 않고 종료합니다." >&2
        exit 1
    fi
fi

echo "=========================================="
echo " 김명규크리에이티브 3D 프린팅 작업관리 웹 "
DISPLAY_HOST="${APP_HOST:-127.0.0.1}"
DISPLAY_PORT="${APP_PORT:-${PORT:-5001}}"
echo " 주소: http://${DISPLAY_HOST}:${DISPLAY_PORT}"
echo " 시작 동기화: 기본 생략 (필요하면 웹 화면의 동기화 버튼 사용)"
echo " 로컬 전용 실행: APP_HOST는 loopback 주소만 허용됩니다."
echo "=========================================="

exec "$VENV/bin/python" "$DIR/app.py"
