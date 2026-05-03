#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 \"Book Title\" \"Author Name\" [isbn]"
  exit 1
}

[[ $# -lt 2 ]] && usage

TITLE="$1"
AUTHOR="$2"
ISBN="${3:-}"
DATE="$(date +%Y-%m-%d)"

# slug: lowercase, spaces→hyphens, strip non-alphanumeric (keep hyphens)
SLUG="$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')"

DEST="content/books/${SLUG}.md"

if [[ -f "$DEST" ]]; then
  echo "Already exists: $DEST"
  exit 1
fi

cat > "$DEST" <<EOF
---
title: "$TITLE"
author: "$AUTHOR"
isbn: "$ISBN"
status: "want-to-read"
rating: 0
date_read: ""
note: ""
---
EOF

echo "Created: $DEST"
