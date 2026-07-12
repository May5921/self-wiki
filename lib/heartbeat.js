/**
 * heartbeat.js — Daily maintenance routine
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getVaultPath } = require('./vault.js');

async function heartbeat() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    console.error('Vault path not found');
    return;
  }

  const wikiDir = path.join(vaultPath, 'wiki');
  const rawDir = path.join(vaultPath, 'raw');
  const indexFile = path.join(vaultPath, '.memory', 'index.md');

  console.log('═══ 每日心跳 ═══\n');

  // ── 1. Rebuild index ───────────────────────────────

  console.log('📊 重建索引...');
  require('./index.js')();

  // ── 2. Check raw files ────────────────────────────

  console.log('\n📝 检查 raw 文件...');
  if (fs.existsSync(rawDir)) {
    const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'));
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    let recentCount = 0;
    let oldCount = 0;

    for (const f of rawFiles) {
      const stat = fs.statSync(path.join(rawDir, f));
      if (stat.mtime > weekAgo) {
        recentCount++;
      } else {
        oldCount++;
      }
    }

    console.log(`  最近7天: ${recentCount} 个文件`);
    console.log(`  7天前: ${oldCount} 个文件`);
  } else {
    console.log('  raw/ 目录不存在');
  }

  // ── 3. Check links ────────────────────────────────

  console.log('\n🔗 检查跨链接...');
  const dirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];
  let linkCount = 0;

  for (const dir of dirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
      const links = content.match(/\[\[.+?\]\]/g) || [];
      linkCount += links.length;
    }
  }

  console.log(`  总链接数: ${linkCount}`);

  // ── 4. Auto-weave if needed ───────────────────────

  if (linkCount < 10) {
    console.log('\n🔗 链接较少，尝试编织...');
    try {
      await require('./weave.js')();
    } catch (e) {
      console.log(`  编织失败: ${e.message}`);
    }
  }

  // ── Summary ────────────────────────────────────────

  console.log('\n═══ 心跳完成 ═══');
}

if (require.main === module) {
  heartbeat().catch(e => {
    console.error('❌ 心跳失败:', e.message);
    process.exit(1);
  });
}

module.exports = heartbeat;
