#!/bin/bash
# Finder/Dock용 실행기. 서버가 준비된 뒤에만 기본 브라우저를 연다.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="127.0.0.1"
PORT="5001"
WEB_URL="http://${HOST}:${PORT}/"
HEALTH_URL="http://${HOST}:${PORT}/api/health"
STATE_DIR="${HOME}/Library/Application Support/김명규크리에이티브 작업관리"
LOG_DIR="${HOME}/Library/Logs/김명규크리에이티브 작업관리"
LOCK_DIR="${STATE_DIR}/starting.lock"
LOCK_TIME_FILE="${LOCK_DIR}/started_at"
LOG_FILE="${LOG_DIR}/server.log"
PLIST_TEMPLATE="${APP_DIR}/scripts/com.kmc.workmanager.plist.template"
PLIST_FILE="${STATE_DIR}/com.kmc.workmanager.plist"
AGENT_LABEL="com.kmc.workmanager"
USER_ID="$(id -u)"
MAX_WAIT_SECONDS=45

mkdir -p "$STATE_DIR" "$LOG_DIR"

healthy() {
    curl --fail --silent --show-error --max-time 1 "$HEALTH_URL" >/dev/null 2>&1
}

release_lock() {
    rm -f "$LOCK_TIME_FILE" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
}

wait_until_ready() {
    local elapsed=0
    while [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ]; do
        if healthy; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    return 1
}

agent_loaded() {
    launchctl print "gui/${USER_ID}/${AGENT_LABEL}" >/dev/null 2>&1
}

prepare_launch_agent() {
    local escaped_app_dir escaped_log_file temporary_plist
    escaped_app_dir="$(printf '%s' "$APP_DIR" | sed 's/[&|]/\\&/g')"
    escaped_log_file="$(printf '%s' "$LOG_FILE" | sed 's/[&|]/\\&/g')"
    temporary_plist="${PLIST_FILE}.new"

    sed \
        -e "s|__APP_DIR__|${escaped_app_dir}|g" \
        -e "s|__LOG_FILE__|${escaped_log_file}|g" \
        "$PLIST_TEMPLATE" > "$temporary_plist"

    if ! cmp -s "$temporary_plist" "$PLIST_FILE" 2>/dev/null; then
        mv "$temporary_plist" "$PLIST_FILE"
    else
        rm -f "$temporary_plist"
    fi
}

if healthy; then
    open "$WEB_URL"
    exit 0
fi

# 이전 실행기가 비정상 종료해 남긴 잠금은 2분 뒤에만 회수한다.
if [ -d "$LOCK_DIR" ]; then
    old_started_at="$(cat "$LOCK_TIME_FILE" 2>/dev/null || printf '0')"
    now="$(date +%s)"
    if [ "$old_started_at" -ge 0 ] 2>/dev/null && [ $((now - old_started_at)) -gt 120 ]; then
        release_lock
    fi
fi

if mkdir "$LOCK_DIR" 2>/dev/null; then
    trap release_lock EXIT HUP INT TERM
    date +%s > "$LOCK_TIME_FILE"

    # 잠금 획득 전에 다른 실행기가 서버를 올렸을 수 있으므로 다시 확인한다.
    if ! healthy; then
        prepare_launch_agent
        # launchd에 등록해 Finder에서 실행해도 터미널 프로세스와 분리되어 유지한다.
        if agent_loaded; then
            launchctl kickstart -k "gui/${USER_ID}/${AGENT_LABEL}"
        else
            launchctl bootstrap "gui/${USER_ID}" "$PLIST_FILE"
        fi
    fi
else
    # 다른 더블클릭이 이미 기동 중이면 새 서버를 만들지 않고 그 결과를 기다린다.
    :
fi

if wait_until_ready; then
    open "$WEB_URL"
    exit 0
fi

echo "작업관리 서버를 시작하지 못했습니다. 로그: $LOG_FILE" >&2
exit 1
