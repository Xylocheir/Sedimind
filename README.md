# Sedimind

> 用自然语言对话，在 Obsidian 里创建、编辑、检索你的笔记；并通过**「沉积层（sediment）」**把 AI 的碎片化思考，沉淀为可检索、可简报的长期资产。

Sedimind 是一款 Obsidian 社区插件，让 LLM 成为你 Vault 的"操作助手"：你只需用对话下指令，它就会自动调用工具完成笔记的创建、编辑、搜索、移动、删除，并支持本地与云端多种大模型。

---

## ✨ 产品特色

### 1. 沉积层（sediment）——让 AI 的"边角料"也有价值

这是本插件最核心的原创机制。AI 与你的交互常被拆成大量短小、碎片化的片段（一条确认、一次重试、半句建议），常规对话会直接丢弃它们。sediment 会把这些片段以带 `fingerprint` 的碎片文件记录到 Vault 的 `.sediment` 文件夹，并通过：

- **重力筛选（gravity-rules）**：按重要性过滤噪声碎片；
- **L1 写入 + 索引**：结构化落盘并建立可检索索引；
- **每日简报（daily-briefing）**：将零散沉积汇总成当日洞察；
- **状态栏指示**：实时显示沉积状态。

让"被丢弃的上下文"变成可回溯、可复用的记忆资产。

### 2. 真实工具调用，而非只聊天

LLM 不只是生成文本，而是真正操作你的笔记。全部由模型自主决策调用：

| 工具 | 功能 |
|------|------|
| `create_note` | 创建新笔记 |
| `edit_note` | 编辑笔记（替换 / 追加 / 插入） |
| `search_notes` | 搜索笔记 |
| `read_note` | 读取笔记内容 |
| `move_note` | 移动 / 重命名笔记 |
| `delete_note` | 删除笔记 |
| `list_files` | 列出目录文件 |
| `get_metadata` | 获取笔记元数据 |
| `get_system_time` | 获取系统时间 |

### 3. 多模型 Provider，本地优先

OpenAI、Anthropic、DeepSeek、Ollama、Gemini，以及 Claude Code / Codex 的 CLI 模式。**Ollama 模式下数据完全本地、零网络请求。**

### 4. MCP 扩展

接入外部 MCP Server，把任意外部工具能力扩展到对话中（桌面端可用，移动端自动降级并提示）。

### 5. 记忆系统

近期对话摘要 + 用户主动保存的记忆，保持长程上下文一致。

### 6. 全中文体验 + 多语言

界面已中文化，并支持英 / 日 / 韩 / 德 / 法 / 西。

### 7. 问题反馈

设置页新增「问题反馈」Tab，可一键提交 **Bug / 功能建议 / 其他** 三类反馈，支持附带截图（最多 5 张）与可选的联系邮箱。反馈经私有 Supabase 端点上报（RLS 策略限制为仅插入 insert-only），不上传任何其他本地数据，便于快速收集与分类处理用户问题。

---

## 🧩 与同类插件的差异

| 维度 | Sedimind | Claudian | Copilot |
|------|-------------------|----------|---------|
| 核心定位 | 笔记操作助手 + 沉积层 | 把编码 Agent 搬进 Vault | 通用 Copilot + 语义检索 |
| 文件操作 | 工具直接读写 | 由 CLI Agent 完成 | Agent 工具写入 |
| 碎片化记录 | **sediment 沉积层（原创）** | 无 | 无专门机制 |
| 本地模型 | Ollama 原生 | 依赖外部 CLI | Ollama 支持 |
| 语义检索 | 工具级检索 | 无 | 核心能力（向量索引） |
| 运行方式 | 调用 LLM API / CLI | 依赖本地 CLI Agent | 调用 LLM API |

> 设计上参考了对 Claudian、Copilot 的竞品拆解（见 [Claudian_Copilot_竞品分析.md](docs/Claudian_Copilot_竞品分析.md)），吸收其模型管理、RAG、记忆等优点。

---

## 🚀 快速开始

### 安装（从源码构建）

```bash
git clone https://github.com/Xylocheir/Sedimind.git
cd Sedimind
npm install
npm run dev      # 开发模式，自动重新编译
npm run build    # 生产构建
```

将构建产物 `main.js`、`styles.css`、`manifest.json` 放入 Vault 的 `.obsidian/plugins/Sedimind/` 并启用。

### 配置

1. 打开对话面板（点击左侧 🤖 图标）→ 右上角 ⚙️ 设置；
2. 选择 Provider 并填写 API Key（Ollama 需本地服务已启动）；
3. 在输入框直接下指令，例如：
   - "创建一篇关于 AI 的笔记"
   - "搜索所有包含『机器学习』的笔记"
   - "编辑笔记『我的笔记』，在末尾追加内容"

---

## 🛠 技术架构

TypeScript + esbuild，基于 Obsidian API。主要模块：

- `src/llm/`：多模型 Provider（OpenAI / Ollama / Anthropic / DeepSeek / Gemini / Claude Code / Codex）
- `src/tools/`：笔记操作工具集
- `src/memory/`：记忆管理器
- `src/mcp/`：MCP 客户端与管理器
- `src/sediment/`：沉积层（重力筛选 / L1 写入 / 索引 / 简报 / 状态栏）
- `src/chat/`：对话视图、消息处理、@ 引用菜单、AI 助手弹窗
- `src/feedbackConfig.ts`：问题反馈上报配置（Supabase 端点，insert-only RLS）

**平台兼容性**：macOS / Windows / Linux 完全支持；iOS / Android MCP 不可用、核心聊天正常；鸿蒙不支持（Obsidian 无官方版本）。

---

## 📄 许可证

MIT License
