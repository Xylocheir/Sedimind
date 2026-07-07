# Claudian 与 Copilot 插件设置与功能拆解

> 基于 Obsidian 插件目录文件与设置页截图整理。  
> 数据源：
> - Claudian：`C:\澡堂子\.obsidian\plugins\realclaudian`
> - Copilot：`C:\澡堂子\.obsidian\plugins\copilot`
> - 截图：`Sedimind/src/assets/竞品分析/{claudian,copilot}`

---

## 一、Claudian（id: realclaudian）

### 1.1 插件定位
- **版本**：2.0.25
- **桌面端独占**：是（`isDesktopOnly: true`）
- **核心定位**：将 **Claude Code、Codex 等编码 Agent 嵌入 Obsidian Vault**，让 Vault 成为 Agent 的工作目录，支持文件读写、搜索、Bash 命令和多步骤工作流。
- **工作模式**：通过调用本地 CLI（如 `claude.exe`、`codex.exe`、`opencode`）完成实际计算，Obsidian 侧主要提供 UI、会话管理和上下文注入。

### 1.2 设置页结构
设置页顶部为 **Tab 导航**：`通用 | Claude | Codex | OpenCode | Pi`（Pi 标签在截图中未展开）。

---

### 1.3 通用设置（General）

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| 语言 | 下拉 | 插件界面显示语言（当前为简体中文） |
| 最大聊天标签数 | 滑块/数字 | 同时开启的最大聊天标签数（3-10），每个标签对应独立 Claude 会话 |
| Claudian 打开位置 | 下拉 | 新建聊天面板打开位置（右侧边栏/左侧边栏等） |
| 流式传输时自动滚动 | 开关 | Claude 流式响应时自动滚动到底部 |
| 流式传输时延迟渲染数学公式 | 开关 | 流式输出中先显示原始 LaTeX，每个文本块完成后再渲染一次公式 |
| 默认展开文件编辑 | 开关 | `Write` 与 `Edit diff` 首次出现时以展开状态显示 |
| 自动生成对话标题 | 开关 | 用户发送首条消息后自动生成对话标题 |
| 标题生成模型 | 下拉 | 用于生成标题的模型（如 Haiku） |
| 用户称呼 | 文本 | 个性化问候语中使用的用户名 |
| 自定义系统提示词 | 文本域 | 追加到默认系统提示词后的额外指令 |
| 排除的标签 | 文本域 | 带这些标签的笔记不会自动加载为上下文（每行一个，不带 `#`） |
| 媒体文件夹 | 文本 | 附件/图片存放路径；`![[image.jpg]]` 会在此查找，留空使用仓库根目录 |
| 需要 Command/Ctrl+Enter 发送 | 开关 | 启用后 Enter 仅换行，发送改为 `Ctrl+Enter`（Windows/Linux）或 `Command+Enter`（macOS） |
| Vim 风格导航映射 | 文本域 | 自定义键盘导航，例如 `map w scrollUp`、`map s scrollDown`、`map i focusInput` |
| 快捷键 | 快捷键绑定 | 内联编辑、打开聊天、新会话、新标签页、关闭标签页等 |

**环境（Shared environment）**
- 共享运行时变量（如 `PATH`、`HTTPS_PROXY`、`SSL_CERT_FILE`），所有 Provider 通用。
- 支持“片段”保存：点击 `+` 保存当前环境变量配置为可切换的片段。

---

### 1.4 Claude 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Claude CLI 路径 | 文本 | 自定义 `claude` 可执行文件路径；原生安装用 `claude.exe`，npm/yarn 安装用 `cli-wrapper.js` |
| Safe mode | 下拉 | Safe toggle 激活时的权限模式（如 `acceptEdits`） |
| 加载用户 Claude 设置 | 开关 | 加载 `~/.claude/settings.json`；启用后可能绕过安全模式 |
| Opus 1M 上下文窗口 | 开关 | 在模型选择器中显示 Opus 1M 版本 |
| Sonnet 1M 上下文窗口 | 开关 | 在模型选择器中显示 Sonnet 1M 版本 |
| Custom models | 文本域 | 追加自定义 Claude model ID，每行一个；环境变量覆盖仍会替换选择器 |
| 命令与技能 | 列表+创建 | 管理 `.claude/commands/` 与 `.claude/skills/` 下的 Vault 级命令/技能，通过 `/名称` 触发 |
| 隐藏命令与技能 | 文本域 | 在下拉菜单中隐藏特定命令/技能（不带前导 `/`） |
| 子代理 | 列表+创建 | 管理 `.claude/agents/` 下的 Vault 级子代理，每个 Markdown 文件定义一个自定义 Agent |
| MCP 服务器 | 列表+添加 | 管理 `.claude/mcp.json` 中的 Vault 级 MCP 服务器配置；上下文保存模式的服务器需 `@` 提及激活 |
| Claude Code 插件 | 列表+刷新 | 管理从 `~/.claude/plugins` 发现的 Claude Code 插件，启用项按 Vault 保存到 `.claude/settings.json` |
| 自定义变量（Claude environment） | 文本域 | 仅传递给 Claude 的运行时变量，如 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`CLAUDE_CODE_USE_BEDROCK` |
| 启用 Chrome 扩展 | 开关 | 允许 Claude 通过 `claude-in-chrome` 与 Chrome 交互，需安装扩展并重启会话 |
| 启用命令模式（!） | 开关 | 在空输入框中输入 `!` 进入命令模式，通过 Node.js `child_process` 直接运行命令；需重新打开视图 |

---

### 1.5 Codex 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Enable Codex provider | 开关 | 启用后 Codex 模型出现在新会话模型选择器中；现有 Codex 会话保留 |
| Installation method | 下拉 | Windows 上启动 Codex 的方式：`Native Windows`（Windows 可执行路径）或 `WSL` |
| Codex CLI path | 文本 | 自定义 `codex` 可执行文件路径，留空从 PATH 自动检测 |
| Safe mode | 下拉 | Safe toggle 激活时的沙箱模式（如 `Workspace write`） |
| Custom models | 文本域 | 追加自定义 Codex model ID，每行一个；`OPENAI_MODEL` 环境变量仍优先 |
| Reasoning summary | 下拉 | 在 thinking block 中展示模型推理过程的摘要（如 `Detailed`） |
| Codex skills | 列表+创建 | 管理 `.codex/skills/` 或 `.agents/skills/` 下的 Vault 级 Codex skills |
| Hidden Skills | 文本域 | 在下拉菜单中隐藏特定 skills（不带前导 `$`） |
| Codex subagents | 列表+创建 | 管理 `.codex/agents/` 下的 Vault 级子代理，每个 TOML 文件定义一个自定义 Agent |
| MCP 服务器 | 说明 | Codex 通过自身 CLI 管理 MCP 服务器，使用 `codex mcp` 配置后可在 Claudian 中使用 |
| Codex environment | 文本域 | 仅传递给 Codex 的运行时变量，如 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`CODEX_SANDBOX` |

---

### 1.6 OpenCode 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Enable OpenCode | 开关 | 启动 `opencode acp` 作为 Provider |
| CLI path | 文本 | 自定义 OpenCode CLI 绝对路径，留空使用 PATH 中的 `opencode` |
| Visible models | 模型选择器 | 选择在聊天选择器中显示的 OpenCode 模型；当前会话模型即使未选中也会固定显示 |
| Commands and skills | 文本域 | 自动检测 `.claude/commands/`、`.claude/skills/`、`.codex/skills/`、`.agents/skills/` 中的命令/技能；此处仅隐藏 OpenCode 下拉中的条目 |
| Hidden Commands and Skills | 文本域 | 隐藏特定 OpenCode 命令与技能（不带前导 `/`） |
| OpenCode Subagents | 列表+创建 | 管理 `.opencode/agent/` 与旧版 `.opencode/agents/` 下的 Vault 级子代理；新条目保存为仅子代理文件并出现在 `@mention` 菜单 |
| Environment Variables | 文本域 | 传递给 OpenCode 的额外环境变量，默认启用 `OPENCODE_ENABLE_EXA=1` |

---

### 1.7 总结：Claudian 的核心能力
1. **多编码 Agent 接入**：Claude、Codex、OpenCode（可能还有 Pi）多种 CLI Agent 共存。
2. **Vault 级扩展**：命令、技能、子代理、MCP 服务器均按 Vault 管理，便于项目级复用。
3. **安全与隔离**：通过 `Safe mode` 控制 Agent 权限；支持环境变量隔离。
4. **个性化与交互**：语言、标签、自定义系统提示、Vim 导航、快捷键。
5. **实验性功能**：Chrome 扩展、命令模式（`!`）。

---

## 二、Copilot（id: copilot）

### 2.1 插件定位
- **版本**：3.3.3
- **桌面端独占**：否（`isDesktopOnly: false`）
- **核心定位**：通用型 AI Copilot，强调 **“与第二大脑对话”**、基于 Vault 的语义搜索/问答、以及可扩展的 Agent 能力。
- **工作模式**：直接通过 API 调用云端或本地 LLM（OpenAI、Anthropic、Google、OpenRouter、Ollama、DeepSeek、SiliconFlow、Azure、Cohere、XAI 等），同时维护本地向量索引与记忆系统。

### 2.2 设置页结构
设置页顶部为 **Tab 导航**：`Basic | Model | QA | Command | Plus | Advanced`。

---

### 2.3 Basic 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Copilot Plus License | 文本+按钮 | 付费许可证输入与激活；Plus 解锁聊天上下文、PDF/图片支持、网页搜索、专属模型等 |
| API Keys | 按钮 | 集中配置不同 AI Provider 的 API Key（实际存储在 Obsidian Keychain） |
| Default Chat Model | 下拉 | 默认聊天模型（截图中为 `deepseek-r1:7b (Ollama)`） |
| Default Mode | 下拉 | 默认聊天模式（Chat / QA / Plus 等） |
| Open Plugin In | 下拉 | 插件打开位置（Sidebar View / Chat View 等） |
| Send Shortcut | 下拉 | 发送快捷键（Enter / Ctrl+Enter） |
| Auto-Add Active Content to Context | 开关 | 发送消息时自动将当前活动笔记或 Web Viewer 标签页加入上下文 |
| Auto-Add Selection to Context | 开关 | 自动将选中文本加入上下文 |
| Images in Markdown | 开关 | 将 Markdown 中的嵌入图片一并传给 AI，仅多模态模型有效 |
| Suggested Prompts | 开关 | 在聊天视图中显示建议提示词 |
| Relevant Notes | 开关 | 在聊天视图中显示相关笔记 |
| Autosave Chat | 开关 | 每次用户消息与 AI 回复后自动保存对话 |
| Generate AI Chat Title on Save | 开关 | 保存时用 AI 生成简洁标题；禁用则使用首条用户消息前 10 词 |
| Default Conversation Folder Name | 文本 | 保存对话的默认文件夹（默认 `copilot/copilot-conversations`） |
| Default Conversation Tag | 文本 | 保存对话时使用的默认标签（默认 `copilot-conversation`） |
| Conversation Filename Template | 文本 | 保存对话笔记的文件名模板（如 `{$topic}@{$date}_{$time}`） |
| Chat History Sort Strategy | 下拉 | 聊天历史列表排序策略（Recency） |
| Project List Sort Strategy | 下拉 | 项目列表排序策略（Recency） |

---

### 2.4 Model 设置

**Chat Models**
- 表格展示所有模型，包括：Model、Provider、Capabilities（视觉/推理）、Enable、CORS、Actions。
- 支持 `Refresh Built-ins` 与 `+ Add Model`。
- 截图中内置模型覆盖：copilot-plus-flash、google/gemini-2.5-flash、gpt-5.5、gpt-5.4-mini、claude-sonnet-4-6、gemini 系列、grok-4.3、deepseek 系列、Ollama 本地模型等。
- 部分模型标记为 `core`、`plusExclusive`、`projectEnabled`。

**上下文参数**
- **Conversation turns in context**：保留前 N 轮对话（默认 15 轮，即 30 条消息）。
- **Auto-compact threshold**：超过指定 token 数时自动总结上下文（默认 128k）。

**Embedding Models**
- 类似表格管理 Embedding 模型，包括 copilot-plus-small/large/multilingual、OpenAI text-embedding-3、Gemini、SiliconFlow Qwen、Cohere、Azure、Ollama 等。
- 可配置 CORS。

---

### 2.5 QA 设置（语义搜索/问答）

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Enable Semantic Search | 开关 | 启用基于语义向量的文档检索；禁用时仅使用快速词法搜索 |
| Enable Inline Citations | 开关 | AI 回复中以脚注形式包含引用与编号来源 |
| Embedding Model | 下拉 | 驱动语义搜索与相关笔记的 Embedding 模型 |
| Auto-Index Strategy | 下拉 | 索引重建时机（如 `ON MODE SWITCH`） |
| Max Sources | 滑块 | 从 Vault 检索并传给 LLM 的相关笔记数量（默认 30） |
| Requests per Minute | 滑块 | Embedding 请求限速（默认 60） |
| Embedding Batch Size | 滑块 | Embedding 批量大小（默认 16） |
| Number of Partitions | 下拉 | Copilot 索引分区数（默认 1）；增大可改善大仓库索引，但需重建索引 |
| Lexical Search RAM Limit | 滑块 | 全文搜索索引最大 RAM 占用（默认 100 MB） |
| Enable Folder and Graph Boosts | 开关 | 为词法搜索结果启用文件夹与图谱相关性加权 |
| Exclusions | 标签列表 | 排除某些文件夹、标签、笔记标题或扩展名不被索引 |
| Inclusions | 标签列表 | 仅索引指定路径、标签、标题；排除优先于包含 |
| Enable Obsidian Sync for Copilot index | 开关 | 将语义索引存放到 `.obsidian` 以同步；否则存放到 Vault 根目录 `.copilot` |
| Disable index loading on mobile | 开关 | 移动端不加载索引以节省资源，仅聊天模式可用 |

---

### 2.6 Command 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Custom Prompts Folder Name | 文本 | 存放自定义提示词的文件夹（`copilot/copilot-custom-prompts`） |
| Custom Prompt Templating | 开关 | 处理提示词变量如 `{activenote}`、`{foldername}`、`{#tag}` |
| Custom Prompts Sort Strategy | 下拉 | 斜杠命令菜单中提示词排序策略 |
| Generate Default / Add Cmd | 按钮 | 生成默认命令或新增命令 |
| 命令列表 | 表格 | Name / In Menu / Slash Cmd / Actions；命令自动从文件夹 `.md` 文件加载 |

---

### 2.7 Plus 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Enable Autonomous Agent | 开关 | 在 Plus 聊天中启用自主 Agent 模式，AI 会逐步推理并自动选择工具 |
| Max Iterations | 滑块 | 自主 Agent 最大推理迭代次数（默认 4） |
| Agent Accessible Tools | 开关组 | 控制 Agent 可调用的工具：Vault Search、Web Search、Write to File、Edit File、YouTube Transcription、Pomodoro、Update Memory |
| Obsidian CLI (Experimental) | 开关 | 通过 Obsidian 桌面 CLI 直接操作 Vault：Daily Note、Random Note、Properties、Tasks、Links、Templates、Bases |
| Store converted markdown at | 文本 | PDF 等文档转换后的 Markdown 保存路径 |
| Memory Folder Name | 文本 | 记忆数据存储文件夹（`copilot/memory`） |
| Reference Recent Conversation | 开关 | 参考近期对话历史以提供更相关回复 |
| Max Recent Conversations | 滑块 | 记住的近期对话数量（默认 30） |
| Reference Saved Memories | 开关 | 访问用户明确要求记住的记忆 |

---

### 2.8 Advanced 设置

| 设置项 | 类型 | 作用说明 |
|--------|------|----------|
| Default System Prompt | 下拉 | 自定义所有消息的系统提示，可选内置提示或自定义提示 |
| System Prompts Folder Name | 文本 | 系统提示文件存放文件夹（`copilot/system-prompts`） |
| API Key Storage | 标签+按钮 | 显示 API Key 存储位置（Obsidian Keychain），支持删除所有 Key |
| Debug Mode | 开关 | 输出调试日志到控制台 |
| Create Log File | 按钮 | 打开/创建 `copilot/copilot-log.md` 用于问题反馈 |

---

### 2.9 data.json 中反映的额外配置
- 大量 Provider API Key 字段：OpenAI、Anthropic、Google、OpenRouter、DeepSeek、SiliconFlow、Azure、Cohere、XAI、Groq、HuggingFace、Mistral、Amazon Bedrock、GitHub Copilot 等。
- 温度（`temperature`: 0.1）、最大 token（`maxTokens`: 6000）、上下文轮数（`contextTurns`: 15）。
- 启用 `stream: true`、默认保存文件夹、默认对话标签、自动保存、自动生成标题、自动添加活动内容到上下文。
- 启用 `enableAutonomousAgent`、`enableSemanticSearchV3`、`enableCustomPromptTemplating`、`enableLexicalBoosts` 等高级功能。
- 模型矩阵：activeModels / activeEmbeddingModels，支持启用、自定义 baseUrl、CORS、能力标记（vision / reasoning）。
- 记忆与历史：`memoryFolderName`、`enableRecentConversations`、`enableSavedMemory`。

### 2.10 总结：Copilot 的核心能力
1. **多模型生态**：覆盖主流云 LLM 与本地 Ollama，支持 Chat 与 Embedding 双模型管理。
2. **RAG 与语义搜索**：基于本地向量索引，实现 Vault 问答、相关笔记、引用标注。
3. **Agent 与工具调用**：Plus 模式下自主 Agent 可调取搜索、网页、文件读写、番茄钟、YouTube 转录、记忆等工具。
4. **记忆与上下文**：近期对话、保存记忆、主动内容注入、选中文本注入。
5. **可定制命令与提示词系统**：自定义 Prompt、Templating、斜杠命令、系统提示文件。
6. **付费增值（Copilot Plus）**：提供专属模型、PDF/图片理解、网页搜索、高级 Agent。

---

## 三、 Claudian vs Copilot 对比

| 维度 | Claudian | Copilot |
|------|----------|---------|
| **核心目标** | 把编码 Agent（Claude Code / Codex / OpenCode）搬进 Vault | 通用 AI Copilot + Vault 语义搜索 + Agent |
| **运行方式** | 依赖本地 CLI Agent（Node 子进程） | 直接调用云端/本地 LLM API |
| **桌面端限制** | 是 | 否（功能在桌面更强） |
| **模型来源** | 由外部 CLI 提供（Claude/Codex/OpenCode） | 内置 20+ 家 Provider，可手动添加 |
| **RAG / 向量搜索** | 无（靠 CLI Agent 自行搜索） | 核心能力，内置语义索引 |
| **文件操作** | 由 CLI Agent 完成 | Agent 工具可直接写/编辑文件 |
| **记忆** | 无专门记忆系统 | 近期对话 + 保存记忆 |
| **自定义提示词** | 系统提示词、Vault 级命令/技能/子代理 | 自定义 Prompt 文件夹、Templating、系统提示文件 |
| **MCP** | 支持 `.claude/mcp.json` 与 `codex mcp` | 无直接 MCP 配置（通过 Agent 工具） |
| **环境变量** | 按 Provider 隔离（Shared / Claude / Codex / OpenCode） | 统一 API Key 管理，存储于 Obsidian Keychain |
| **付费增值** | 无（需自备 CLI/账号） | Copilot Plus（许可证解锁高级功能） |
| **UI 语言** | 截图显示已中文化 | 英文界面 |
| **安全模式** | Safe mode（acceptEdits / Workspace write） | 无显式 Safe mode，靠工具开关控制 |

---

## 四、可借鉴到 Sedimind 的设计点

1. **Provider 模型管理**：Copilot 的表格化模型管理（启用、能力、CORS、自定义 baseUrl）值得参考。
2. **环境变量与片段切换**：Claudian 的 Shared/Provider 环境变量片段设计，适合管理多个本地 CLI Agent。
3. **RAG 与引用**：Copilot 的语义搜索、Inline Citations、Max Sources、Exclusions/Inclusions 是知识库对话的关键。
4. **Agent 工具开关**：Copilot 的 `Autonomous Agent` 与工具白名单（Vault Search / Web Search / Write / Edit）可用来设计工具权限。
5. **记忆系统**：Copilot 的“近期对话”与“保存记忆”机制可提升长期上下文一致性。
6. **Vault 级扩展**：Claudian 的 `.claude/commands/`、`.skills/`、`.agents/`、`.mcp.json` 项目级管理思路，适合代码/工作流向插件扩展。
7. **发送快捷键与 Vim 导航**：Claudian 的 `Ctrl+Enter` 切换与 `map` 式导航映射，对键盘优先体验有参考价值。

---

> 说明：Pi 标签在 Claudian 截图中未展开，未列入本拆解；如需补充，可补充 Pi 相关设置页截图。
