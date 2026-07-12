/**
 * weave.js — Cross-link wiki pages
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getVaultPath, getConfig } = require('./vault.js');

async function weave() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    console.error('Vault path not found');
    return;
  }

  const config = getConfig();
  if (!config?.api?.endpoint || !config?.api?.key) {
    console.error('API not configured');
    return;
  }

  const wikiDir = path.join(vaultPath, 'wiki');
  const logfile = path.join(vaultPath, '.memory', 'last_extract.log');

  // ── Collect all wiki entries ───────────────────────

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
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          entries.push({
            title: titleMatch[1].trim(),
            file: fp,
            dir,
            slug: path.basename(f, '.md'),
            content
          });
        }
      } catch (e) {}
    }
  }

  if (entries.length < 2) {
    console.log('📭 不够2条，跳过编织');
    return;
  }

  console.log(`🔗 知识编织：${entries.length} 个条目`);

  // ── Call API for link suggestions ──────────────────

  const titles = entries.map(e => e.title);

  const body = JSON.stringify({
    model: config.api.model,
    messages: [{
      role: 'user',
      content: `你是一个知识图谱编织专家。给定一组知识条目标题，找出所有语义相关的配对。

规则：
- 每对必须是不同类型的知识（如 gotcha 和 pattern）或同类型但互补
- 每个条目最多关联3个其他条目
- 关联必须有明确的逻辑关系（因果、互补、同一主题的不同方面）
- 只返回JSON，不要代码块

输出格式：
{"links": [["标题A", "标题B"], ["标题C", "标题D"]]}

知识条目：
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    }],
    temperature: 0.2,
    max_tokens: 2000
  });

  let links = [];

  try {
    const result = await new Promise((resolve, reject) => {
      const url = new URL(config.api.endpoint);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api.key}`,
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
            if (m) resolve(JSON.parse(m[0]).links || []);
            else resolve([]);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });

    links = result;
  } catch (e) {
    console.log(`❌ API 调用失败: ${e.message}`);
    return;
  }

  if (links.length === 0) {
    console.log('📭 未发现可编织的关联');
    return;
  }

  // ── Apply links ───────────────────────────────────

  let linksAdded = 0;

  for (const [title1, title2] of links) {
    const entry1 = entries.find(e => e.title === title1);
    const entry2 = entries.find(e => e.title === title2);

    if (!entry1 || !entry2) continue;

    // Add link to entry1
    const link1 = `\n\n## 相关知识\n\n- [[${entry2.slug}|${entry2.title}]]`;
    if (!entry1.content.includes(`[[${entry2.slug}]]`)) {
      fs.appendFileSync(entry1.file, link1);
      linksAdded++;
    }

    // Add link to entry2
    const link2 = `\n\n## 相关知识\n\n- [[${entry1.slug}|${entry1.title}]]`;
    if (!entry2.content.includes(`[[${entry1.slug}]]`)) {
      fs.appendFileSync(entry2.file, link2);
      linksAdded++;
    }
  }

  console.log(`✅ 编织完成: ${linksAdded} 条关联`);
}

if (require.main === module) {
  weave().catch(e => {
    console.error('❌ 编织失败:', e.message);
    process.exit(1);
  });
}

module.exports = weave;
