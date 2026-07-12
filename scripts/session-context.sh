#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# session-context.sh — SessionStart hook (lightweight)
# Outputs compact index + search rules to Claude
# ═══════════════════════════════════════════════════════
set -uo pipefail

# Resolve vault path via config
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
  echo "[self-wiki] vault 未配置。运行: mkdir -p ~/.self-wiki && cp templates/config.json ~/.self-wiki/config.json && 编辑 vault_path"
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
