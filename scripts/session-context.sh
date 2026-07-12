#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# session-context.sh — SessionStart hook (lightweight)
# Outputs compact index + search rules to Claude
# ═══════════════════════════════════════════════════════
set -uo pipefail

# Use node for everything to avoid Git Bash /d/ path issues
node -e "
const fs = require('fs');
const path = require('path');
const v = require(path.join(process.env.HOME || '', '.claude', 'hooks', '_self-wiki-resolve.js'));
" 2>/dev/null

# Fallback: resolve vault via env or config directly
VAULT="$(node -e "
const fs=require('fs'),p=require('path'),os=require('os');
function getVault(){
  if(process.env.SELF_WIKI_VAULT) return process.env.SELF_WIKI_VAULT;
  if(process.env.MEMORY_VAULT_PATH) return process.env.MEMORY_VAULT_PATH;
  try{const c=JSON.parse(fs.readFileSync(p.join(os.homedir(),'.self-wiki','config.json'),'utf8'));if(c.vault_path)return c.vault_path;}catch{}
  try{for(const d of fs.readdirSync(os.homedir())){try{const c=JSON.parse(fs.readFileSync(p.join(os.homedir(),d,'.memory','config.json'),'utf8'));if(c.vault_path)return c.vault_path;}catch{}}}catch{}
  return '';
}
console.log(getVault());
" 2>/dev/null)"

if [ -z "$VAULT" ] || [ ! -d "$VAULT" ]; then
  exit 0
fi

CLAUDE_MD="$VAULT/CLAUDE.md"
WIKI_DIR="$VAULT/wiki"

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
  grep '^-' "$INDEX" 2>/dev/null | head -50
fi
