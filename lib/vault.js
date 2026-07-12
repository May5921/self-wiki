#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
// vault.js — 共享的 vault 路径解析模块
// 所有文件统一调用这个，不再重复代码
// ═══════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function getVaultPath() {
  // 1. 环境变量
  if (process.env.SELF_WIKI_VAULT) return process.env.SELF_WIKI_VAULT;
  if (process.env.MEMORY_VAULT_PATH) return process.env.MEMORY_VAULT_PATH;

  // 2. 常见位置
  const home = os.homedir();
  const cfgPaths = [
    path.join(home, '.self-wiki', 'config.json'),
  ];

  for (const p of cfgPaths) {
    if (fs.existsSync(p)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.vault_path) return cfg.vault_path;
      } catch {}
    }
  }

  // 3. 搜索
  try {
    const dirs = fs.readdirSync(home);
    for (const d of dirs) {
      const cfgPath = path.join(home, d, '.memory', 'config.json');
      if (fs.existsSync(cfgPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
          if (cfg.vault_path) return cfg.vault_path;
        } catch {}
      }
    }
  } catch {}

  return '';
}

function getWikiDir() {
  const vault = getVaultPath();
  return vault ? path.join(vault, 'wiki') : '';
}

function getConfig() {
  const vault = getVaultPath();
  if (!vault) return null;
  const cfgPath = path.join(vault, '.memory', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { getVaultPath, getWikiDir, getConfig };
