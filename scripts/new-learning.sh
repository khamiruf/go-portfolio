#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 \"Title\" [\"tag1, tag2, ...\"]"
  exit 1
}

[[ $# -lt 1 ]] && usage

TITLE="$1"
TAGS="${2:-}"
DATE="$(date +%Y-%m-%d)"

# slug: lowercase, spaces→hyphens, strip non-alphanumeric (keep hyphens)
SLUG="$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')"

DEST="content/learnings/${SLUG}.md"

if [[ -f "$DEST" ]]; then
  echo "Already exists: $DEST"
  exit 1
fi

if [[ -n "$TAGS" ]]; then
  # Convert comma-separated tags to YAML inline array
  TAGS_YAML='['
  FIRST=true
  IFS=',' read -ra TAG_ARRAY <<< "$TAGS"
  for tag in "${TAG_ARRAY[@]}"; do
    trimmed="$(echo "$tag" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if $FIRST; then
      TAGS_YAML+="\"$trimmed\""
      FIRST=false
    else
      TAGS_YAML+=", \"$trimmed\""
    fi
  done
  TAGS_YAML+=']'
else
  TAGS_YAML='[]'
fi

cat > "$DEST" <<EOF
---
title: "$TITLE"
date: "$DATE"
tags: $TAGS_YAML
---

EOF

echo "Created: $DEST"
