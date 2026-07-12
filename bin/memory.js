#!/usr/bin/env node
/**
 * memory.js — CLI entry point for self-wiki
 * Pure Node.js implementation (no bash dependency)
 */
'use strict';

const path = require('path');

// ── Helpers ─────────────────────────────────────────

function showHelp() {
  console.log(`
self-wiki v0.1.0
Karpathy-style self-growing knowledge base

Usage: self-wiki <command> [options]

Commands:
  extract [--all]       Extract knowledge from raw/ files
  search <keywords>     Search wiki knowledge (BM25 + expansion)
  index                 Rebuild wiki index and CLAUDE.md
  lint                  Check knowledge base health
  weave                 Cross-link wiki pages
  heartbeat             Daily maintenance routine
  feedback <file> <type> Mark wiki page as useful|wrong|outdated

Environment:
  SELF_WIKI_VAULT       Override default vault path
`);
}

// ── CLI Argument Parsing ──────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  case 'search': {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Usage: self-wiki search <keywords>');
      process.exit(1);
    }
    // Use the search module directly
    const search = require('../lib/search.js');
    const results = search(query);
    if (results.length === 0) {
      console.log('🔍 未找到相关知识');
    } else {
      console.log(`\n🔍 "${query}" — 找到 ${results.length} 条结果:\n`);
      for (const r of results.slice(0, 10)) {
        const preview = (r.content || '').slice(0, 100).replace(/\n/g, ' ');
        console.log(`📄 [${r.type}] ${r.title}`);
        console.log(`   ${preview}...`);
        console.log(`   来源: ${r.source} | 日期: ${r.date || 'N/A'}\n`);
      }
    }
    break;
  }

  case 'extract': {
    const extract = require('../lib/extract.js');
    extract();
    break;
  }

  case 'index': {
    const index = require('../lib/index.js');
    index();
    break;
  }

  case 'lint': {
    const lint = require('../lib/lint.js');
    lint();
    break;
  }

  case 'weave': {
    const weave = require('../lib/weave.js');
    weave().catch(e => {
      console.error('❌ 编织失败:', e.message);
      process.exit(1);
    });
    break;
  }

  case 'heartbeat': {
    const heartbeat = require('../lib/heartbeat.js');
    heartbeat().catch(e => {
      console.error('❌ 心跳失败:', e.message);
      process.exit(1);
    });
    break;
  }

  case 'feedback': {
    const file = args[1];
    const type = args[2];
    if (!file || !type) {
      console.error('Usage: self-wiki feedback <wiki-file> <useful|wrong|outdated>');
      process.exit(1);
    }
    const feedback = require('../lib/feedback.js');
    feedback(file, type);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
