/**
 * index.js — Rebuild wiki index and CLAUDE.md
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getVaultPath, getConfig } = require('./vault.js');

function buildIndex() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    console.error('Vault path not found');
    return;
  }

  const config = getConfig();
  const thresholds = config?.thresholds || {};
  const DEMOTE_DAYS = thresholds.demote_days || 30;
  const EXPIRE_DAYS = thresholds.expire_days || 180;
  const MAX_ENTRIES = thresholds.max_claude_entries || 15;

  const wikiDir = path.join(vaultPath, 'wiki');
  const claudeMd = path.join(vaultPath, '.memory', 'CLAUDE.md');

  // ── Collect all entries ─────────────────────────────

  const entries = [];
  const dirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];

  for (const dir of dirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith('.md')) continue;

      const fp = path.join(dirPath, f);
      try {
        const content = fs.readFileSync(fp, 'utf8');

        // Parse frontmatter
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let tags = [], confidence = 0.5, date = '', useful = 0;

        if (fmMatch) {
          const fm = fmMatch[1];
          const tagsMatch = fm.match(/tags:\s*\[(.+?)\]/);
          if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim());

          const confMatch = fm.match(/confidence:\s*([\d.]+)/);
          if (confMatch) confidence = parseFloat(confMatch[1]);

          const dateMatch = fm.match(/date:\s*(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) date = dateMatch[1];

          const usefulMatch = fm.match(/useful:\s*(\d+)/);
          if (usefulMatch) useful = parseInt(usefulMatch[1]);
        }

        // Parse title
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (!titleMatch) continue;

        // Check for wikilinks (refs)
        const refs = (content.match(/\[\[.+?\]\]/g) || []).length;

        entries.push({
          title: titleMatch[1].trim(),
          dir,
          file: fp,
          tags,
          confidence,
          date,
          useful,
          refs
        });
      } catch (e) {}
    }
  }

  // ── Time-based scoring ─────────────────────────────

  const now = Date.now();
  const DAY_MS = 86400000;

  function timeDecay(dateStr) {
    if (!dateStr) return 0.5;
    const age = (now - new Date(dateStr).getTime()) / DAY_MS;
    if (age < 0) return 1.0;
    if (age > EXPIRE_DAYS) return 0.1;
    if (age > DEMOTE_DAYS) return 0.5;
    return 1.0;
  }

  // ── Sort by score ──────────────────────────────────

  entries.sort((a, b) => {
    const scoreA = a.refs * a.confidence * timeDecay(a.date) * (1 + a.useful / 10);
    const scoreB = b.refs * b.confidence * timeDecay(b.date) * (1 + b.useful / 10);
    return scoreB - scoreA;
  });

  // ── Auto-archive expired entries ───────────────────

  let archived = 0;
  for (const entry of entries) {
    if (!entry.date) continue;
    const age = (now - new Date(entry.date).getTime()) / DAY_MS;
    if (age > EXPIRE_DAYS && entry.useful === 0) {
      const archiveDir = path.join(wikiDir, 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });
      const archivePath = path.join(archiveDir, path.basename(entry.file));
      fs.renameSync(entry.file, archivePath);
      archived++;
    }
  }

  if (archived > 0) {
    console.log(`📦 自动归档 ${archived} 条过期知识`);
  }

  // ── Build index.md ─────────────────────────────────

  const indexLines = ['# Wiki Index\n'];
  indexLines.push(`> 更新于 ${new Date().toISOString().slice(0, 10)}\n`);

  for (const dir of dirs) {
    const dirEntries = entries.filter(e => e.dir === dir);
    if (dirEntries.length === 0) continue;

    indexLines.push(`\n## ${dir}\n`);
    for (const e of dirEntries) {
      const slug = path.basename(e.file, '.md');
      indexLines.push(`- [[${slug}|${e.title}]] (refs:${e.refs}, conf:${e.confidence})`);
    }
  }

  const indexMd = indexLines.join('\n');
  fs.writeFileSync(path.join(vaultPath, '.memory', 'index.md'), indexMd);

  // ── Build CLAUDE.md (Top entries only) ─────────────

  const claudeLines = ['# 知识库\n'];
  claudeLines.push('**当用户问题涉及编程、工具、框架、踩坑时，先搜索知识库：**\n');
  claudeLines.push('搜到就引用：「根据知识库记录：[引用]」。搜不到就正常回答。\n');
  claudeLines.push('## Top 知识（按质量排序）\n');

  const topEntries = entries.slice(0, MAX_ENTRIES);
  for (const e of topEntries) {
    const ageDays = e.date ? Math.floor((now - new Date(e.date).getTime()) / DAY_MS) : '?';
    // Get first paragraph of content
    const content = fs.readFileSync(e.file, 'utf8');
    const bodyMatch = content.match(/^>\s*\*\*原文引用\*\*:\s*(.+)$/m);
    const snippet = bodyMatch ? bodyMatch[1].slice(0, 100) : '';
    claudeLines.push(`- **${e.title}**（${ageDays}天前）：${snippet}`);
  }

  claudeLines.push('\n## 全局约定\n');
  claudeLines.push('- 删除走回收站');
  claudeLines.push('- 项目文件放工作目录');

  fs.writeFileSync(claudeMd, claudeLines.join('\n'));

  // ── Stats ──────────────────────────────────────────

  const stats = {
    total: entries.length,
    byDir: {}
  };
  for (const dir of dirs) {
    stats.byDir[dir] = entries.filter(e => e.dir === dir).length;
  }

  console.log('═══ 重建索引 ═══\n');
  console.log(`✅ index.md 已重建（${entries.length} 页，精简版）`);
  console.log(`CLAUDE.md: ${topEntries.length} entries (compact)\n`);
  console.log('═══ 统计 ═══');
  console.log(`  📄 Wiki 总页数: ${stats.total}`);
  for (const dir of dirs) {
    console.log(`     ${dir}: ${stats.byDir[dir]}`);
  }
  console.log(`  📌 CLAUDE.md: ${claudeLines.length} 行（精简版）`);
  console.log(`  🗓️ 日期: ${today}`);
}

// Run if called directly
if (require.main === module) {
  buildIndex();
} else {
  module.exports = buildIndex;
}

const today = new Date().toISOString().slice(0, 10);
