#!/bin/bash

# Sourceable helpers; they do not create environments or invoke pip.
dependency_hash() {
    local root="$1"
    shasum -a 256 "$root/requirements.txt" "$root/constraints.txt" | shasum -a 256 | awk '{print $1}'
}

dependency_install_needed() {
    local root="$1" venv="$2" stamp="$2/.dependency-stamp" expected
    [ -x "$venv/bin/python" ] || return 0
    expected="$(dependency_hash "$root")"
    if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$expected" ]; then return 1; fi
    # A missing/stale stamp may still be repaired without network access when
    # every active direct requirement already matches its exact constraint pin.
    if dependency_versions_match "$root" "$venv" && write_dependency_stamp "$root" "$venv"; then return 1; fi
    return 0
}

dependency_versions_match() {
    local root="$1" venv="$2"
    "$venv/bin/python" - "$root/requirements.txt" "$root/constraints.txt" <<'PY'
import importlib.metadata as metadata
import re
import sys

try:
    from packaging.requirements import Requirement
    from packaging.version import Version
except Exception:
    try:
        from pip._vendor.packaging.requirements import Requirement
        from pip._vendor.packaging.version import Version
    except Exception:
        raise SystemExit(1)

def requirements(path):
    result = []
    for raw in open(path, encoding="utf-8"):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith(("-", "@")):
            raise ValueError("unsupported include or option")
        result.append(Requirement(line))
    return result

def canonical(name):
    return re.sub(r"[-_.]+", "-", name).lower()

try:
    required = requirements(sys.argv[1])
    pins = {}
    for constraint in requirements(sys.argv[2]):
        if constraint.marker or constraint.extras or constraint.url or len(constraint.specifier) != 1:
            raise ValueError("constraint is not a unique exact pin")
        pin = next(iter(constraint.specifier))
        if pin.operator != "==" or not pin.version or canonical(constraint.name) in pins:
            raise ValueError("constraint is not a unique exact pin")
        pins[canonical(constraint.name)] = pin.version
    for requirement in required:
        if requirement.marker or requirement.extras or requirement.url:
            raise ValueError("unsupported requirement form")
        name = canonical(requirement.name)
        if name not in pins:
            raise SystemExit(1)
        pin_version = Version(pins[name])
        if not requirement.specifier.contains(pin_version, prereleases=True) or metadata.version(requirement.name) != pins[name]:
            raise SystemExit(1)
except Exception:
    raise SystemExit(1)
PY
}

write_dependency_stamp() {
    local root="$1" venv="$2" stamp="$2/.dependency-stamp" temp
    temp="$(mktemp "$venv/.dependency-stamp.XXXXXX")" || return 1
    if ! dependency_hash "$root" > "$temp"; then
        rm -f "$temp"
        return 1
    fi
    mv -f "$temp" "$stamp"
}

install_dependencies_and_stamp() {
    local root="$1" venv="$2"
    if ! "$venv/bin/python" -m pip install -r "$root/requirements.txt" -c "$root/constraints.txt"; then
        return 1
    fi
    write_dependency_stamp "$root" "$venv"
}
