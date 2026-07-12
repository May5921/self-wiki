#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# hook-capture.sh — Claude Code SessionEnd Hook
# Captures clean session transcript → raw/日期.md
# ═══════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MEMORY_DIR="$(dirname "$SCRIPT_DIR")"

# Resolve vault path via config (same logic as session-context.sh)
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

# Fallback: parent of self-wiki (legacy behavior)
if [ -z "$VAULT" ]; then
  VAULT="$(dirname "$MEMORY_DIR")"
fi

RAW_DIR="$VAULT/raw"
LOGFILE="$MEMORY_DIR/last_hook.log"

mkdir -p "$RAW_DIR" "$MEMORY_DIR"

# ── Read hook input from stdin ─────────────────────────

INPUT=$(cat 2>/dev/null || echo "{}")

TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
SESSION_ID=$(printf '%s' "$INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

# ── Extract clean content with Node.js ─────────────────

CONTENT=""
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  CONTENT=$(node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').trim().split('\n');
const result = [];

// Read last 1000 lines for context
const tail = lines.slice(-1000);

for (const line of tail) {
  try {
    const entry = JSON.parse(line);

    // User messages
    if (entry.type === 'user') {
      const msg = entry.message;
      let text = '';
      if (typeof msg === 'string') text = msg;
      else if (Array.isArray(msg)) {
        text = msg.filter(c => c.type === 'text').map(c => c.text).join(' ');
      }
      if (text.length > 10) {
        result.push('[user] ' + text.substring(0, 500));
      }
    }
    // Assistant messages
    else if (entry.type === 'assistant') {
      const msg = typeof entry.message === 'string' ? JSON.parse(entry.message) : entry.message;
      const textParts = (msg?.content || [])
        .filter(c => c.type === 'text')
        .map(c => c.text);
      const text = textParts.join(' ').trim();
      if (text.length > 10) {
        result.push('[assistant] ' + text.substring(0, 500));
      }
    }
    // Tool results (might contain important info)
    else if (entry.type === 'tool_result') {
      const content = entry.content || '';
      if (content.length > 20 && content.length < 2000) {
        // Only keep short, meaningful tool outputs
        const clean = content.replace(/<[^>]+>/g, '').trim();
        if (clean.length > 20) {
          result.push('[tool] ' + clean.substring(0, 500));
        }
      }
    }
  } catch {}
}

// Output last 300 meaningful messages
console.log(result.slice(-300).join('\n\n'));
" "$TRANSCRIPT_PATH" 2>/dev/null)
fi

# ── Skip if no meaningful content ──────────────────────

if [ -z "$CONTENT" ] || [ ${#CONTENT} -lt 50 ]; then
  printf '%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" > "$LOGFILE"
  exit 0
fi

# ── Append to daily raw file ───────────────────────────

TODAY=$(date +%Y-%m-%d)
RAW_FILE="$RAW_DIR/$TODAY.md"

if [ ! -f "$RAW_FILE" ]; then
  printf '%s\n\n' "# Session Notes — $TODAY" > "$RAW_FILE"
fi

{
  printf '\n## Session %s (%s)\n\n' "${SESSION_ID:0:8}" "$(date '+%H:%M')"
  printf '%s\n' "$CONTENT"
  printf '\n'
} >> "$RAW_FILE"

# ── Update heartbeat ───────────────────────────────────

printf '%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" > "$LOGFILE"

exit 0
