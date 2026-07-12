#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
// search.js — Lightweight 4-way retrieval
// BM25 + Temporal + Keyword Expansion + Related Links
// ═══════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { getVaultPath } = require('./vault.js');

// ── Keyword Expansion (轻量语义) ──────────────────────

const SYNONYMS = {
  // 编程相关
  'bug': ['错误', '问题', '故障', '异常', 'error', 'issue'],
  'error': ['bug', '错误', '问题', '异常'],
  '修复': ['解决', 'fix', 'repair', '修复'],
  '配置': ['设置', 'config', 'setup', 'setting'],
  '部署': ['发布', 'deploy', '上线'],
  '性能': ['速度', '优化', 'performance', 'speed'],
  '安全': ['权限', 'security', 'auth'],
  // 框架相关
  '微信': ['小程序', 'wechat', 'weapp', 'miniprogram'],
  '前端': ['frontend', 'ui', '界面', '页面'],
  '后端': ['backend', 'server', '服务端'],
  '数据库': ['database', 'db', '存储', 'mysql', 'redis'],
  // 工具相关
  'git': ['版本控制', 'github', '仓库'],
  'docker': ['容器', 'container', '镜像'],
  'npm': ['node', '包管理', 'package'],
  // 问题类型
  '白屏': ['空白', 'blank', '不显示', '加载失败'],
  '报错': ['错误', 'error', '异常', '失败'],
  '慢': ['性能', '卡顿', '延迟', 'slow'],
};

function expandKeywords(query) {
  const expanded = new Set([query]);
  const lower = query.toLowerCase();

  // 检查同义词
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (lower.includes(key) || syns.some(s => lower.includes(s))) {
      expanded.add(key);
      syns.forEach(s => expanded.add(s));
    }
  }

  // 提取英文单词
  const engWords = query.match(/[a-z]+/g) || [];
  engWords.forEach(w => expanded.add(w));

  // 提取中文词（简单分词）
  const cnChars = query.match(/[一-鿿]+/g) || [];
  cnChars.forEach(w => {
    if (w.length >= 2) expanded.add(w);
  });

  return [...expanded];
}

// ── Temporal Extraction (时间过滤) ────────────────────

function extractDate(content) {
  // 从 frontmatter 提取
  const dateMatch = content.match(/^---[\s\S]*?date:\s*(\d{4}-\d{2}-\d{2})/m);
  if (dateMatch) return dateMatch[1];

  // 从内容提取
  const dateInContent = content.match(/(\d{4}-\d{2}-\d{2})/);
  return dateInContent ? dateInContent[1] : null;
}

function isRecent(dateStr, days = 30) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / (1000 * 60 * 60 * 24);
  return diff <= days;
}

// ── Related Links (相关知识) ──────────────────────────

function extractRelatedLinks(content) {
  const links = [];
  const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

// ── BM25 Implementation ───────────────────────────────

function tokenize(text) {
  const tokens = [];
  // English words
  const engWords = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  tokens.push(...engWords);
  // Chinese: bigrams only (more meaningful than single chars)
  const chinese = text.toLowerCase().match(/[一-鿿]+/g) || [];
  for (const seg of chinese) {
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
  }
  return tokens;
}

function buildIndex(wikiDir) {
  const docs = [];
  const dirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];

  for (const dir of dirs) {
    const dirPath = path.join(wikiDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const f of fs.readdirSync(dirPath)) {
      if (!f.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(dirPath, f), 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : f.replace('.md', '');
        const tokens = tokenize(content);
        const date = extractDate(content);
        const related = extractRelatedLinks(content);

        docs.push({
          file: path.join(dirPath, f),
          slug: f.replace('.md', ''),
          title,
          type: dir,
          content,
          tokens,
          date,
          related,
          tf: {}
        });

        for (const t of tokens) {
          docs[docs.length - 1].tf[t] = (docs[docs.length - 1].tf[t] || 0) + 1;
        }
      } catch {}
    }
  }
  return docs;
}

function bm25(query, docs, k1 = 1.5, b = 0.75) {
  const queryTokens = tokenize(query);
  const N = docs.length;
  const avgDl = docs.reduce((s, d) => s + d.tokens.length, 0) / (N || 1);

  const idf = {};
  for (const qt of queryTokens) {
    const df = docs.filter(d => d.tf[qt]).length;
    idf[qt] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  const scores = docs.map(doc => {
    let score = 0;
    const dl = doc.tokens.length;
    for (const qt of queryTokens) {
      const tf = doc.tf[qt] || 0;
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * dl / avgDl);
      score += (idf[qt] || 0) * numerator / denominator;
    }
    const titleLower = doc.title.toLowerCase();
    let titleBoost = 1;
    for (const qt of queryTokens) {
      if (titleLower.includes(qt)) titleBoost += 0.5; // Additive, not multiplicative
    }
    score *= Math.min(titleBoost, 3); // Cap at 3x
    return { ...doc, score };
  });

  return scores
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ── 4-Way Retrieval (轻量版) ─────────────────────────

function search4Way(query, docs, options = {}) {
  const { timeRange = 30, maxResults = 10 } = options;

  // 1. BM25 搜索
  const bm25Results = bm25(query, docs);

  // 2. 关键词扩展搜索
  const expanded = expandKeywords(query);
  let expandedResults = [];
  for (const kw of expanded) {
    if (kw !== query) {
      expandedResults.push(...bm25(kw, docs));
    }
  }

  // 3. 时间过滤（最近 N 天）
  const recentDocs = docs.filter(d => isRecent(d.date, timeRange));

  // 4. 相关知识链接
  const relatedSlugs = new Set();
  for (const doc of bm25Results.slice(0, 3)) {
    doc.related.forEach(slug => relatedSlugs.add(slug));
  }
  const relatedResults = docs.filter(d => relatedSlugs.has(d.slug));

  // 合并去重 + 加权
  const merged = new Map();

  for (const r of bm25Results) {
    merged.set(r.slug, { ...r, score: r.score * 1.0, source: 'bm25' });
  }

  for (const r of expandedResults) {
    if (merged.has(r.slug)) {
      merged.get(r.slug).score += r.score * 0.5; // 扩展结果权重 0.5
    } else {
      merged.set(r.slug, { ...r, score: r.score * 0.5, source: 'expanded' });
    }
  }

  for (const r of relatedResults) {
    if (merged.has(r.slug)) {
      merged.get(r.slug).score += 0.3; // 相关链接加分
      merged.get(r.slug).source += '+related';
    } else {
      merged.set(r.slug, { ...r, score: 0.3, source: 'related' });
    }
  }

  // 时间加分（最近的加权）
  for (const [slug, item] of merged) {
    if (isRecent(item.date, 7)) {
      item.score *= 1.2; // 最近7天加20%
    } else if (isRecent(item.date, 30)) {
      item.score *= 1.1; // 最近30天加10%
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ── Export for module use ─────────────────────────────

function search(query, options = {}) {
  const vaultPath = getVaultPath();
  if (!vaultPath || !fs.existsSync(path.join(vaultPath, 'wiki'))) {
    return [];
  }

  const wikiDir = path.join(vaultPath, 'wiki');
  const docs = buildIndex(wikiDir);
  return search4Way(query, docs, options);
}

// ── CLI ───────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let timeRange = 30;
  let maxResults = 10;
  const queryParts = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      timeRange = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      maxResults = parseInt(args[i + 1]);
      i++;
    } else {
      queryParts.push(args[i]);
    }
  }

  const query = queryParts.join(' ');

  if (!query) {
    console.log('用法: self-wiki search <关键词> [--days 30] [--limit 10]');
    process.exit(0);
  }

  const results = search(query, { timeRange, maxResults });

  if (results.length === 0) {
    console.log(`🔍 未找到 "${query}" 相关知识`);
  } else {
    console.log(`🔍 "${query}" — 找到 ${results.length} 条结果:\n`);
    for (const r of results) {
      const snippet = r.content
        .replace(/^---[\s\S]*?---\n/m, '')
        .replace(/^# .*\n/m, '')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 150);
      console.log(`📄 [${r.type}] ${r.title}`);
      console.log(`   ${snippet}...`);
      console.log(`   来源: ${r.source} | 日期: ${r.date || '未知'}`);
      console.log('');
    }
  }
}

module.exports = search;
