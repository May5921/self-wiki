# 🧠 self-wiki

> Stop using RAG. Let your AI compile knowledge into a living Wiki.

基于 Karpathy LLM Wiki 模式的自生长知识库系统。让 Claude Code 自动从编程会话中学习、积累、连接知识。

## 核心理念

> "别用 RAG，让 LLM 把知识编译成一座持续生长的活 Wiki。" — Andrej Karpathy

```
你的编程经验
  → 自动捕获（Hook）
  → 自动编译（DeepSeek）
  → 自动组织（wiki/ + wikilink）
  → 自动进化（CLAUDE.md 晋降级）
  → 自动关联（weave 编织）
  → 下次会话自动注入
```

## 快速开始

```bash
# 安装
npm install -g self-wiki

# 或者克隆使用
git clone https://github.com/your-username/self-wiki.git
cd self-wiki

# 配置
cp templates/config.json ~/.self-wiki/config.json
# 编辑 ~/.self-wiki/config.json，填入你的 API key

# 使用
self-wiki extract    # 提取知识
self-wiki search "关键词"  # 搜索
self-wiki index      # 重建索引
```

## 架构

```
raw/              ← 不可变原始素材（Hook 自动写入）
wiki/             ← 编译后的知识库
  ├── decisions/    架构决策
  ├── gotchas/      踩坑记录
  ├── patterns/     代码模式
  ├── conventions/  命名约定
  └── todos/        待办事项
CLAUDE.md          ← 热知识 Top-15（自动晋升/降级）
```

## 命令

| 命令 | 说明 |
|------|------|
| `extract [--all]` | 提炼未处理的会话 |
| `search <keywords>` | 搜索知识库 |
| `index` | 重建索引 |
| `lint` | 知识库健康检查 |
| `weave` | 跨会话知识编织 |
| `heartbeat` | 每日心跳（索引+编织+简报） |
| `feedback <file> <type>` | 标记知识 useful/wrong/outdated |

## 三层封装

### Layer 1: Skill（最轻）

复制 `skills/self-wiki.md` 到 `.claude/skills/`，Claude 自动识别。

### Layer 2: MCP Server（可选）

```bash
claude mcp add self-wiki -- node mcp-server.js
```

提供工具：`search_knowledge`, `get_wiki_stats`, `check_health`

### Layer 3: Hooks（全自动）

会话结束自动提取，开始自动注入。

## 成本

| 指标 | 数值 |
|------|------|
| 每次提炼（50文件） | ≈ ¥0.05 |
| 月成本（每天1次） | ≈ ¥1.50 |
| 总月成本 | **≈ ¥1.50** |

## 依赖

- **Node.js** ≥ 14
- **DeepSeek API Key**（或兼容 API）

无需 Git Bash，纯 Node.js 跨平台运行。

## 项目结构

```
self-wiki/
├── bin/
│   └── memory.js          # CLI 入口
├── lib/
│   ├── extract.js         # 提取
│   ├── search.js          # 搜索（BM25）
│   ├── index.js           # 索引
│   ├── lint.js            # 健康检查
│   ├── weave.js           # 编织
│   ├── heartbeat.js       # 心跳
│   ├── feedback.js        # 反馈
│   └── vault.js           # 路径解析
├── skills/
│   └── self-wiki.md       # Claude Skill
├── mcp-server.js          # MCP Server
├── scripts/
│   ├── hook-capture.sh    # Hook 捕获
│   └── session-context.sh # 会话上下文
├── templates/
│   └── config.json
├── package.json
├── README.md
└── LICENSE
```

## License

MIT
