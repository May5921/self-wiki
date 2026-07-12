---
name: self-wiki
description: 自生长知识库管理 - 从对话中自动提取、组织、连接知识
---

# self-wiki 知识库管理

## 概述

self-wiki 是一个自生长知识库系统，自动从编程会话中学习、积累、连接知识。

## 可用命令

当用户提到以下关键词时，执行对应操作：

| 关键词 | 命令 | 说明 |
|--------|------|------|
| "提取记忆" / "保存知识" | `node bin/memory.js extract` | 从会话记录提取知识 |
| "搜索知识" / "查找记录" | `node bin/memory.js search <关键词>` | 搜索知识库 |
| "重建索引" | `node bin/memory.js index` | 重建索引 |
| "健康检查" | `node bin/memory.js lint` | 检查知识库状态 |
| "知识编织" | `node bin/memory.js weave` | 建立知识关联 |
| "系统维护" | `node bin/memory.js heartbeat` | 每日维护 |

## 知识库位置

默认位置（可通过环境变量 SELF_WIKI_VAULT 修改）：
- **配置**: `~/.self-wiki/config.json` 或 `$SELF_WIKI_VAULT/.memory/config.json`
- **Wiki**: `<vault>/wiki/`
- **Raw**: `<vault>/raw/`

## 使用规范

### 1. 搜索知识库
当用户问到编程、工具、框架、踩坑等问题时：
```
先搜索知识库 → 找到就引用 → 搜不到就正常回答
```

引用格式：「根据知识库记录：[引用内容]」

### 2. 提取记忆
每次会话结束前（或用户说"提取记忆"）：
```bash
node bin/memory.js extract
```

### 3. 知识分类

| 类型 | 目录 | 说明 |
|------|------|------|
| decision | wiki/decisions/ | 架构决策 |
| gotcha | wiki/gotchas/ | 踩坑记录 |
| pattern | wiki/patterns/ | 代码模式 |
| convention | wiki/conventions/ | 命名约定 |
| todo | wiki/todos/ | 待办事项 |

### 4. 用户反馈

当用户说"这个知识有用"或"这个知识错了"时：
```bash
node bin/memory.js feedback <文件路径> <useful|wrong|outdated>
```

## 成本

- 每次提取：约 ¥0.05
- 月成本：约 ¥1.50
- 依赖：DeepSeek API（¥1/百万token）

## 注意事项

1. 删除文件走回收站
2. 项目文件放工作目录
3. 配置文件不要提交到 Git
