/**
 * extract.js — Multi-Stage Knowledge Extraction
 * raw/ → 提取 → 验证 → 草稿 → wiki/
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getVaultPath, getConfig } = require('./vault.js');

const MEMORY_DIR = path.join(__dirname, '..');

// ── Helpers ──────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(msg, logfile) {
  const line = `[${ts()}] ${msg}\n`;
  if (logfile) fs.appendFileSync(logfile, line);
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// ── Jaccard Similarity ──────────────────────────────

function jaccard(a, b) {
  const sa = new Set(), sb = new Set();
  for (let i = 0; i < a.length - 1; i++) sa.add(a.slice(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) sb.add(b.slice(i, i + 2));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter || 1);
}

// ── Contradiction Detection ─────────────────────────

function detectContradiction(item, existing) {
  const negativePatterns = ['不再', '以前', '之前', '错误', '废弃', '不要', '不能'];
  const itemText = (item.body || '') + ' ' + (item.source_quote || '');
  const hasNegative = negativePatterns.some(p => itemText.includes(p));

  if (!hasNegative) return false;

  const titleSim = jaccard(item.title, existing.title);
  if (titleSim > 0.3) return true;

  return false;
}

// ── Main ────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const processAll = args.includes('--all');

  // ── Resolve paths ──────────────────────────────────

  const vaultPath = getVaultPath();
  if (!vaultPath) die('Vault path not found. Set SELF_WIKI_VAULT or create config.json');

  const config = getConfig();
  if (!config?.api?.endpoint) die('API endpoint not configured');
  if (!config?.api?.key) die('API key not configured');
  if (!config?.api?.model) die('API model not configured');

  const API_ENDPOINT = config.api.endpoint;
  const API_KEY = config.api.key;
  const API_MODEL = config.api.model;

  const wikiDir = path.join(vaultPath, 'wiki');
  const draftsDir = path.join(wikiDir, '.drafts');
  const rawDir = path.join(vaultPath, 'raw');
  const logfile = path.join(vaultPath, '.memory', 'last_extract.log');
  const transaction = path.join(MEMORY_DIR, '.transaction');
  const promptTemplate = fs.readFileSync(path.join(MEMORY_DIR, 'templates', 'prompt.md'), 'utf8');

  fs.mkdirSync(draftsDir, { recursive: true });
  fs.mkdirSync(path.dirname(logfile), { recursive: true });

  // ── Rollback interrupted transaction ───────────────

  if (fs.existsSync(transaction)) {
    log('ROLLBACK: cleaning previous incomplete run', logfile);
    fs.unlinkSync(transaction);
  }

  // ── Collect unprocessed raw files ──────────────────

  const today = new Date().toISOString().slice(0, 10);
  const filesToProcess = [];

  if (processAll) {
    // Process all unprocessed files
    const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.md')).sort();
    for (const f of files) {
      const fp = path.join(rawDir, f);
      const firstLine = fs.readFileSync(fp, 'utf8').split('\n')[0];
      if (!firstLine.startsWith('✅')) {
        filesToProcess.push(fp);
      }
    }
  } else {
    // Process today's file
    const todayFile = path.join(rawDir, `${today}.md`);
    if (fs.existsSync(todayFile)) {
      const firstLine = fs.readFileSync(todayFile, 'utf8').split('\n')[0];
      if (!firstLine.startsWith('✅')) {
        filesToProcess.push(todayFile);
      }
    }
  }

  if (filesToProcess.length === 0) {
    console.log('📭 没有待处理的文件');
    return;
  }

  console.log(`📝 找到 ${filesToProcess.length} 个待处理文件`);
  log(`Found ${filesToProcess.length} files to process`, logfile);

  // ── Build existing knowledge index ─────────────────

  const existingPages = [];
  const dirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];
  for (const dir of dirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          existingPages.push(`[${dir}] ${titleMatch[1].trim()}`);
        }
      } catch (e) {}
    }
  }

  // ── Load raw content ───────────────────────────────

  let rawContent = '';
  for (const f of filesToProcess) {
    rawContent += '\n\n' + fs.readFileSync(f, 'utf8');
  }

  // ── Stage 1: Extract via API ──────────────────────

  console.log('⏳ Stage 1: 提取知识...');
  log('Stage 1: Extracting...', logfile);

  const maxItems = Math.min(50, Math.max(5, filesToProcess.length * 3));

  const prompt = promptTemplate
    .replace('{EXISTING_PAGES}', existingPages.join('\n'))
    .replace('{FEEDBACK_HISTORY}', '(暂无)')
    .replace('{DATE}', today)
    .replace(/最多 \d+ 条/g, `最多 ${maxItems}条`);

  // Split into batches
  const lines = rawContent.split('\n');
  const BATCH_SIZE = 200;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    batches.push(lines.slice(i, i + BATCH_SIZE).join('\n'));
  }

  async function callAPI(batchContent) {
    const body = JSON.stringify({
      model: API_MODEL,
      messages: [{ role: 'user', content: prompt + '\n\n---\n\n会话记录:\n' + batchContent }],
      temperature: 0.3,
      max_tokens: 4000
    });

    return new Promise((resolve, reject) => {
      const url = new URL(API_ENDPOINT);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 60000
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const r = JSON.parse(data);
            const c = r.choices?.[0]?.message?.content || '';
            const m = c.match(/\{[\s\S]*\}/);
            if (m) { resolve(JSON.parse(m[0]).items || []); }
            else { resolve([]); }
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  let allItems = [];
  try {
    const results = await Promise.allSettled(batches.map(b => callAPI(b)));
    for (const r of results) {
      if (r.status === 'fulfilled') allItems.push(...r.value);
    }
    console.log(`✅ Stage 1 完成: ${allItems.length} 条`);
    log(`Stage 1: ${allItems.length} items extracted`, logfile);
  } catch (e) {
    console.error('❌ Stage 1 失败:', e.message);
    log(`Stage 1 ERROR: ${e.message}`, logfile);
    process.exit(1);
  }

  // ── Stage 2: Validate + Dedup ─────────────────────

  console.log('⏳ Stage 2: 验证质量...');

  // Load existing wiki for contradiction detection
  const existing = [];
  for (const dir of dirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          existing.push({ title: titleMatch[1].trim(), body: content, dir });
        }
      } catch (e) {}
    }
  }

  let validated = 0, filtered = 0, evolved = 0;

  for (const item of allItems) {
    const confidence = parseFloat(item.confidence) || 0;
    if (confidence < 0.6) { filtered++; continue; }
    if (!item.source_quote || item.source_quote.trim().length < 5) { filtered++; continue; }
    if (!item.title || !item.body || item.body.length < 20) { filtered++; continue; }

    // Check for contradictions
    let contradictionFound = null;
    for (const ex of existing) {
      if (detectContradiction(item, ex)) {
        contradictionFound = ex;
        break;
      }
    }

    if (contradictionFound) {
      const evolutionNote = `\n\n## 演变记录 (${today})\n\n之前：${contradictionFound.title}\n现在：${item.title}\n> ${(item.source_quote || '').substring(0, 100)}\n`;
      fs.appendFileSync(path.join(wikiDir, contradictionFound.dir, contradictionFound.title + '.md'), evolutionNote);
      evolved++;
      continue;
    }

    // Check for duplicates
    let isDuplicate = false;
    for (const ex of existing) {
      if (ex.title === item.title) { isDuplicate = true; break; }
      if (jaccard(item.title, ex.title) > 0.6) { isDuplicate = true; break; }
    }
    if (isDuplicate) { filtered++; continue; }

    // Save to drafts
    const slug = item.title.replace(/[^a-zA-Z0-9一-鿿]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 25);
    const draftPath = path.join(draftsDir, `${slug}.json`);
    fs.writeFileSync(draftPath, JSON.stringify(item, null, 2));
    validated++;
  }

  console.log(`✅ Stage 2 完成: ${validated} 通过, ${filtered} 过滤, ${evolved} 演变`);

  // ── Stage 3: Draft → Publish ──────────────────────

  console.log('⏳ Stage 3: 发布知识...');

  let published = 0, keptAsDraft = 0;

  const drafts = fs.readdirSync(draftsDir).filter(f => f.endsWith('.json'));
  for (const f of drafts) {
    const draftPath = path.join(draftsDir, f);
    const item = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    const confidence = parseFloat(item.confidence) || 0;

    if (confidence >= 0.8) {
      // Auto-publish
      const typeMap = { decision: 'decisions', gotcha: 'gotchas', pattern: 'patterns', convention: 'conventions', todo: 'todos' };
      const dir = typeMap[item.type];
      if (!dir) continue;

      const dirPath = path.join(wikiDir, dir);
      fs.mkdirSync(dirPath, { recursive: true });

      const slug = item.title.replace(/[^a-zA-Z0-9一-鿿]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 25);
      const tags = (item.tags || []).join(', ');
      const sourceQuote = (item.source_quote || '').replace(/\n/g, ' ');

      const md = `---
tags: [${tags}]
confidence: ${confidence}
date: ${today}
useful: 0
---

# ${item.title}

> **原文引用**: ${sourceQuote}

${item.body || ''}

> 提取于 ${today} | 置信度: ${confidence}
`;

      fs.writeFileSync(path.join(dirPath, `${slug}.md`), md);
      fs.unlinkSync(draftPath);
      published++;
    } else {
      keptAsDraft++;
    }
  }

  console.log(`✅ Stage 3 完成: 发布 ${published} 条，草稿 ${keptAsDraft} 条`);
  log(`Stage 3: published ${published}, drafts ${keptAsDraft}`, logfile);

  // ── Mark processed files ──────────────────────────

  for (const f of filesToProcess) {
    const content = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, `✅ Processed ${ts()}\n${content}`);
  }

  // ── Rebuild index ─────────────────────────────────

  console.log('🔄 重建索引...');
  require('./index.js')();

  console.log('✅ 全部完成');
}

if (require.main === module) {
  main().catch(e => {
    console.error('❌ 致命错误:', e.message);
    process.exit(1);
  });
}

module.exports = main;
