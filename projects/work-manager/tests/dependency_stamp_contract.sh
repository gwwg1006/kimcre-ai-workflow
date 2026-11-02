#!/bin/bash
set -euo pipefail
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/venv/bin"
cp requirements.txt constraints.txt "$ROOT/"
printf '%s\n' '#!/bin/bash' 'if [ "$1" = "-" ]; then [ "${FAKE_METADATA_MATCH:-0}" = 1 ] && exit 0 || exit 1; fi' 'if [ -n "${FAKE_PIP_LOG:-}" ]; then echo pip >> "$FAKE_PIP_LOG"; fi' 'if [ "${FAKE_PIP_FAIL:-0}" = 1 ]; then exit 1; fi' 'exit 0' > "$ROOT/venv/bin/python"
chmod +x "$ROOT/venv/bin/python"
source scripts/dependency_stamp.sh
install_dependencies_and_stamp "$ROOT" "$ROOT/venv"
if dependency_install_needed "$ROOT" "$ROOT/venv"; then echo 'unchanged files requested install'; exit 1; fi
old="$(cat "$ROOT/venv/.dependency-stamp")"
rm "$ROOT/venv/.dependency-stamp"
if FAKE_METADATA_MATCH=1 FAKE_PIP_LOG="$ROOT/pip.log" dependency_install_needed "$ROOT" "$ROOT/venv"; then echo 'matching venv was not accepted'; exit 1; fi
[ -f "$ROOT/venv/.dependency-stamp" ] || { echo 'matching venv did not create stamp'; exit 1; }
[ ! -s "$ROOT/pip.log" ] || { echo 'matching venv invoked pip'; exit 1; }
printf '\n# changed\n' >> "$ROOT/requirements.txt"
if ! dependency_install_needed "$ROOT" "$ROOT/venv"; then echo 'changed files skipped install'; exit 1; fi
old="$(cat "$ROOT/venv/.dependency-stamp")"
if FAKE_PIP_FAIL=1 install_dependencies_and_stamp "$ROOT" "$ROOT/venv"; then echo 'failed install unexpectedly succeeded'; exit 1; fi
if [ "$(cat "$ROOT/venv/.dependency-stamp")" != "$old" ]; then echo 'failed install changed stamp'; exit 1; fi
printf '\nnew-package>=1\n' >> "$ROOT/requirements.txt"
if FAKE_METADATA_MATCH=1 dependency_install_needed "$ROOT" "$ROOT/venv"; then echo 'unpinned requirement was accepted'; exit 1; fi

if [ -x "$PWD/.venv/bin/python" ]; then
    LIVE="$ROOT/live"
    mkdir -p "$LIVE"
    cp constraints.txt "$LIVE/"
    cp requirements.txt "$LIVE/requirements.txt"
    if ! dependency_versions_match "$LIVE" "$PWD/.venv"; then echo 'current venv did not match'; exit 1; fi
    printf 'Flask>=4\n' > "$LIVE/requirements.txt"
    if dependency_versions_match "$LIVE" "$PWD/.venv"; then echo 'incompatible specifier matched'; exit 1; fi
    printf 'Flask>=3,<4\n' > "$LIVE/requirements.txt"
    if ! dependency_versions_match "$LIVE" "$PWD/.venv"; then echo 'compatible range failed'; exit 1; fi
    printf '%s\n' '-r other.txt' > "$LIVE/requirements.txt"
    if dependency_versions_match "$LIVE" "$PWD/.venv"; then echo 'include unexpectedly matched'; exit 1; fi
fi
echo 'dependency_stamp_contract.sh: ok'
