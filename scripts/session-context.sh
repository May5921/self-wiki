#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# session-context.sh — SessionStart hook (lightweight)
# Outputs compact index + search rules to Claude
# ═══════════════════════════════════════════════════════
set -uo pipefail

MEMORY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WIKI_DIR="$MEMORY_DIR/../wiki"
CLAUDE_MD="$MEMORY_DIR/../CLAUDE.md"

# 1. Output CLAUDE.md (compact top entries + search rules)
if [ -f "$CLAUDE_MD" ]; then
  cat "$CLAUDE_MD"
fi

# 2. Output COMPACT index (just titles + tags, no full content)
INDEX="$WIKI_DIR/index.md"
if [ -f "$INDEX" ]; then
  echo ""
  echo "---"
  echo "知识库索引（标题+标签）："
  # Only output lines starting with "-" (compact entries)
  grep '^-' "$INDEX" 2>/dev/null | head -50
fi
