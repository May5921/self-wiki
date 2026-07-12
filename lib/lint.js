/**
 * lint.js — Check knowledge base health
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getVaultPath } = require('./vault.js');

function lint() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    console.error('Vault path not found');
    return;
  }

  const wikiDir = path.join(vaultPath, 'wiki');
  const rawDir = path.join(vaultPath, 'raw');
  const heartbeatFile = path.join(vaultPath, '.memory', 'last_hook.log');

  let issues = 0;
  let warnings = 0;

  console.log('═══ 知识库健康检查 ═══\n');

  // ── Check directory structure ──────────────────────

  const requiredDirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];
  for (const dir of requiredDirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 创建缺失目录: ${dir}`);
    }
  }

  // ── Check each wiki entry ──────────────────────────

  const contentHashes = new Map();
  const duplicates = [];

  for (const dir of requiredDirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

    for (const f of files) {
      const fp = path.join(dirPath, f);
      try {
        const content = fs.readFileSync(fp, 'utf8');
        const relPath = path.relative(wikiDir, fp);

        // Check for required fields
        const hasTitle = /^#\s+.+$/m.test(content);
        const hasFrontmatter = /^---\n[\s\S]*?\n---/.test(content);
        const hasQuote = /原文引用/.test(content);

        if (!hasTitle) {
          console.log(`  ❌ ${relPath}: 缺少标题`);
          issues++;
        }

        if (!hasFrontmatter) {
          console.log(`  ⚠️  ${relPath}: 缺少 frontmatter`);
          warnings++;
        }

        if (!hasQuote) {
          console.log(`  ⚠️  ${relPath}: 缺少原文引用`);
          warnings++;
        }

        // Check for orphan links
        const links = content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || [];
        for (const link of links) {
          const target = link.match(/\[\[([^\]|]+)/)?.[1];
          if (target) {
            const targetPath = path.join(dirPath, `${target}.md`);
            const altPath = path.join(wikiDir, '**', `${target}.md`);
            if (!fs.existsSync(targetPath)) {
              // Check if it exists elsewhere
              const found = requiredDirs.some(d => {
                const p = path.join(wikiDir, d, `${target}.md`);
                return fs.existsSync(p);
              });
              if (!found) {
                console.log(`  ⚠️  ${relPath}: 孤儿链接 [[${target}]]`);
                warnings++;
              }
            }
          }
        }

        // Check for duplicates
        const bodyHash = crypto.createHash('md5').update(content.slice(0, 500)).digest('hex');
        if (contentHashes.has(bodyHash)) {
          console.log(`  ❌ ${relPath}: 与 ${contentHashes.get(bodyHash)} 内容相似`);
          duplicates.push(relPath);
          issues++;
        } else {
          contentHashes.set(bodyHash, relPath);
        }

      } catch (e) {
        console.log(`  ❌ ${f}: 读取失败 - ${e.message}`);
        issues++;
      }
    }
  }

  // ── Check raw directory ────────────────────────────

  if (fs.existsSync(rawDir)) {
    const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'));
    const unprocessed = rawFiles.filter(f => {
      const content = fs.readFileSync(path.join(rawDir, f), 'utf8');
      return !content.startsWith('✅');
    });

    if (unprocessed.length > 0) {
      console.log(`\n📝 有 ${unprocessed.length} 个未处理的 raw 文件`);
    }
  }

  // ── Check hook status ──────────────────────────────

  if (fs.existsSync(heartbeatFile)) {
    const lastHook = fs.readFileSync(heartbeatFile, 'utf8').trim();
    const hookDate = new Date(lastHook);
    const hoursSince = (Date.now() - hookDate.getTime()) / (1000 * 60 * 60);

    if (hoursSince > 24) {
      console.log(`\n⏰ Hook 已 ${Math.floor(hoursSince)} 小时未触发`);
      warnings++;
    }
  }

  // ── Check cross-links ─────────────────────────────

  let linkCount = 0;
  for (const dir of requiredDirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
      const links = content.match(/\[\[.+?\]\]/g) || [];
      linkCount += links.length;
    }
  }

  // ── Summary ────────────────────────────────────────

  console.log('\n═══ 总结 ═══');
  console.log(`  ❌ 问题: ${issues}`);
  console.log(`  ⚠️  警告: ${warnings}`);
  console.log(`  🔗 跨链接: ${linkCount}`);

  if (issues === 0 && warnings === 0) {
    console.log('\n✅ 知识库健康！');
  } else {
    console.log('\n⚠️  需要关注以上问题');
  }

  return { issues, warnings, links: linkCount, healthy: issues === 0 && warnings === 0 };
}

if (require.main === module) {
  const result = lint();
  process.exit(result.issues > 0 ? 1 : 0);
}

module.exports = lint;
