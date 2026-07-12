#!/usr/bin/env node
/**
 * mcp-server.js — MCP Server for self-wiki
 * Provides tools that Claude can call
 */
'use strict';

const { getVaultPath, getConfig } = require('./lib/vault.js');
const search = require('./lib/search.js');
const lint = require('./lib/lint.js');

// ── MCP Protocol Implementation ─────────────────────

const TOOLS = [
  {
    name: 'search_knowledge',
    description: '搜索知识库，返回相关知识条目',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_wiki_stats',
    description: '获取知识库统计信息',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'check_health',
    description: '检查知识库健康状态',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// ── Tool Handlers ───────────────────────────────────

function handleSearch(query) {
  const results = search(query);
  return {
    results: results.slice(0, 10).map(r => ({
      title: r.title,
      content: (r.content || '').slice(0, 200),
      type: r.type,
      date: r.date
    })),
    total: results.length
  };
}

function handleStats() {
  const vaultPath = getVaultPath();
  if (!vaultPath) return { error: 'Vault not found' };

  const fs = require('fs');
  const path = require('path');
  const wikiDir = path.join(vaultPath, 'wiki');
  const dirs = ['decisions', 'gotchas', 'patterns', 'conventions', 'todos'];

  const stats = { total: 0, byType: {} };
  for (const dir of dirs) {
    const dirPath = path.join(wikiDir, dir);
    if (fs.existsSync(dirPath)) {
      const count = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).length;
      stats.byType[dir] = count;
      stats.total += count;
    } else {
      stats.byType[dir] = 0;
    }
  }

  return stats;
}

function handleHealthCheck() {
  return lint();
}

// ── MCP Server ──────────────────────────────────────

function processRequest(request) {
  const { method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'self-wiki',
          version: '0.1.0'
        }
      };

    case 'tools/list':
      return { tools: TOOLS };

    case 'tools/call': {
      const { name, arguments: args } = params;
      let result;

      switch (name) {
        case 'search_knowledge':
          result = handleSearch(args.query);
          break;
        case 'get_wiki_stats':
          result = handleStats();
          break;
        case 'check_health':
          result = handleHealthCheck();
          break;
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    }

    default:
      return {
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

// ── Main ────────────────────────────────────────────

let buffer = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  buffer += chunk;

  // Process complete messages
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) break;

    const contentLength = parseInt(contentLengthMatch[1]);
    const messageStart = headerEnd + 4;

    if (buffer.length < messageStart + contentLength) break;

    const messageBody = buffer.slice(messageStart, messageStart + contentLength);
    buffer = buffer.slice(messageStart + contentLength);

    try {
      const request = JSON.parse(messageBody);
      const response = processRequest(request);

      if (request.id !== undefined) {
        response.id = request.id;
      }

      const responseStr = JSON.stringify(response);
      const responseMessage = `Content-Length: ${Buffer.byteLength(responseStr)}\r\n\r\n${responseStr}`;
      process.stdout.write(responseMessage);
    } catch (e) {
      // Ignore parse errors
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});
