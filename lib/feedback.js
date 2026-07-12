/**
 * feedback.js — User feedback on wiki entries
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getVaultPath } = require('./vault.js');

function feedback(filePath, type) {
  if (!filePath || !type) {
    console.error('用法: feedback <wiki文件路径> <useful|wrong|outdated>');
    process.exit(1);
  }

  if (!['useful', 'wrong', 'outdated'].includes(type)) {
    console.error('类型必须是: useful, wrong, 或 outdated');
    process.exit(1);
  }

  const vaultPath = getVaultPath();
  if (!vaultPath) {
    console.error('Vault path not found');
    process.exit(1);
  }

  // Resolve file path
  let wikiFile = filePath;
  if (!path.isAbsolute(filePath)) {
    // Try to find in wiki directory
    const wikiDir = path.join(vaultPath, 'wiki');
    const dirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];

    for (const dir of dirs) {
      const candidate = path.join(wikiDir, dir, filePath);
      if (fs.existsSync(candidate)) {
        wikiFile = candidate;
        break;
      }
      // Try with .md extension
      if (!filePath.endsWith('.md')) {
        const candidateMd = candidate + '.md';
        if (fs.existsSync(candidateMd)) {
          wikiFile = candidateMd;
          break;
        }
      }
    }
  }

  if (!fs.existsSync(wikiFile)) {
    console.error(`文件不存在: ${wikiFile}`);
    process.exit(1);
  }

  // Read and update file
  let content = fs.readFileSync(wikiFile, 'utf8');

  // Update useful count
  const usefulMatch = content.match(/useful:\s*(\d+)/);
  if (usefulMatch) {
    const oldCount = parseInt(usefulMatch[1]);
    const newCount = type === 'useful' ? oldCount + 1 : Math.max(0, oldCount - 1);
    content = content.replace(/useful:\s*\d+/, `useful: ${newCount}`);
  }

  // Add feedback note
  const date = new Date().toISOString().slice(0, 10);
  const feedbackNote = `\n> ${date}: 用户标记为 ${type}\n`;
  content += feedbackNote;

  // Save
  fs.writeFileSync(wikiFile, content);

  // Also save to corrections.jsonl for learning
  const correctionsFile = path.join(vaultPath, '.memory', 'corrections.jsonl');
  const correction = {
    date,
    type,
    file: path.relative(vaultPath, wikiFile),
    title: content.match(/^#\s+(.+)$/m)?.[1] || 'unknown'
  };
  fs.appendFileSync(correctionsFile, JSON.stringify(correction) + '\n');

  console.log(`✅ 已标记: ${path.basename(wikiFile)} → ${type}`);
}

if (require.main === module) {
  const [filePath, type] = process.argv.slice(2);
  feedback(filePath, type);
}

module.exports = feedback;
