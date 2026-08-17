#!/usr/bin/env bash
# Prints commit subjects since the last tag, grouped by conventional-commit type.
# Output is a starting point to paste into CHANGELOG.md and edit, not a finished changelog.
set -euo pipefail

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)
if [ -z "$LAST_TAG" ]; then
    echo "No git tags found, so there is no starting point to diff from." >&2
    echo "Tag a baseline first, e.g.:" >&2
    echo "  git tag -a 1.0.0 ee95583 -m 'Pre-Docker baseline'" >&2
    exit 1
fi

echo "Commits since ${LAST_TAG}:"
echo

print_group() {
    local prefix=$1 heading=$2
    local lines
    lines=$(git log --no-merges --pretty='%s' "${LAST_TAG}..HEAD" | grep -E "^${prefix}(\(.+\))?: " || true)
    if [ -n "$lines" ]; then
        echo "### ${heading}"
        echo
        echo "$lines" | sed -E "s/^${prefix}(\(.+\))?: //" | sed 's/^/- /'
        echo
    fi
}

print_group feat Added
print_group fix Fixed
print_group chore Chores

OTHER=$(git log --no-merges --pretty='%s' "${LAST_TAG}..HEAD" | grep -vE '^(feat|fix|chore)(\(.+\))?: ' || true)
if [ -n "$OTHER" ]; then
    echo "### Unclassified (no conventional prefix)"
    echo
    echo "$OTHER" | sed 's/^/- /'
    echo
fi
