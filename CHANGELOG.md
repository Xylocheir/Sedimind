# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-07-30

### Added
- **沉积层（Sediment）完整子系统（Phase 1–3）**
  - Phase 1：对话终答自动沉积、重力筛选、L1 化石写入、每日简报、状态栏沉积指标
  - Phase 2 认知基岩：L1/L2 动态投影（化石不可变）、变质产张力命题、断层线 + 💎 裁决、矿脉聚类、反差注入、存活率/检索排序
  - Phase 3 主动进化：反差度地质勘探排序、实时虫洞编辑语义比对、受控认知杂交、周期压实（化石不可变，仅标 superseded）、两个弹窗、状态栏 🪱💡 态、4 个命令
  - 命令：`rebuild-sediment-index`、`layout-ready` 简报等
- **意识层记忆模块**：`Memory/journal` 每日日志 + `Memory/profile` 长期事实，自动注入对话上下文
- **问题反馈系统**：Supabase 私有库匿名提交（零配置、内容不泄露、含可选截图）
- **设置项全部实时生效**：开关 `onChange` 即时刷新受影响的 UI/监听器，无需重开设置页或重载插件
- **划词工具栏子菜单样式**（连续绿描边胶囊）
- `ROADMAP.md` 路线图文档

### Changed
- **插件更名**：显示名与 id 由 `obsidian-llm-chat` → `Sedimind`
- **发布流程重构**：版本工具 `version-bump.mjs` 改为基于 CHANGELOG `[Unreleased]` 折叠（自动记录 + 上传时定版本号 + tag 全自动）

### Fixed
- 虫洞开关被锁在深度分析旧快照（需重开设置页才解锁）→ 改为实时读取 settings
- `create_note` 拍平路径保留层级、文件夹引用键内联
- 分叉 ID 定位法统一 fork/编辑/删除/重生成

## [1.1.0] - 2026-07-28

### Added

- 问题反馈模块：设置页新增「问题反馈」Tab，支持提交 Bug / 功能建议 / 其他类型反馈
- 反馈支持附带截图（最多 5 张）与可选的联系邮箱，通过私有 Supabase 端点上报
- 全 7 语言新增反馈相关文案（feedback* 系列翻译键）
- 设置面板 Tab 导航从五栏扩展为六栏（通用 / 模型管理 / MCP / 记忆 / 快捷键 / 问题反馈）

### Changed

- 设置面板 UI 重构为六栏 Tab 导航（新增「问题反馈」栏）

---

## [1.0.0] - 2026-07-10

### Added

- 多模型支持：OpenAI、Anthropic、Ollama、DeepSeek，以及本地 CLI 模式
- 笔记操作工具集：创建、编辑、搜索、读取、列出、删除、移动、元数据查询、系统时间
- 引用 Chips 系统：@ 符号触发、拖拽文件/文件夹、编辑器选中文字、文件选择器
- 多标签页对话面板：新建、切换、关闭、重命名标签页
- 流式消息输出：逐 token 实时渲染
- 工具调用循环：LLM 自动调用工具，最多 10 轮迭代
- 历史对话面板：按日期分组，支持加载和删除
- 消息区设置面板：在对话面板内查看和修改设置，支持滚动
- AI 助手弹窗：编辑器右键触发，支持拖拽移动和迭代修改
- 划词工具栏：选中文字后浮出，支持高亮、翻译、AI 助手等操作
- 多选模式：批量删除和导出消息
- 任务列表面板：提炼任务和逐条执行
- MCP 客户端：接入外部 MCP Server
- 记忆系统：近期对话摘要和保存记忆
- 模型表格管理：内置 9 个模型 + 自定义添加
- 多语言支持：中文、英文、日文、韩文、德文、法文、西班牙文
- 语音输入：Web Speech API 实现
- 图片粘贴：自动保存到 attachments 目录

### Changed

- 设置面板 UI 重构为五栏 Tab 导航（通用/模型管理/MCP/记忆/快捷键）
- AI 助手弹窗交互流程优化：动态插入预览区，flex 布局
- 消息区与输入区分割线位置调整（提高 10px）
- 消息消失位置调整（标签栏下方 8px）

### Fixed

- 引用菜单首次打开位置错误（DOM 挂载优先 + 强制布局重算）
- 引用菜单从二级菜单返回后位置错误（动态定位 + 顶部溢出翻转）
- 设置面板与历史面板互斥逻辑（打开一个自动关闭另一个）
- 设置面板消息内容叠加问题（打开时隐藏消息，关闭时恢复）
- 设置面板内容无法滚动（添加自定义滚动条）
- 点击设置按钮在设置和历史之间切换的问题（同面板 toggle 行为）

---

## [0.5.0] - 2026-07-07

### Added

- MCP Client：接入外部 MCP Server，stdio 传输，JSON-RPC 2.0 协议
- 记忆系统：近期对话摘要（自动注入 system prompt）+ 保存记忆（save_memory 工具）
- 模型表格化管理：Copilot 风格表格，内置 9 个模型 + 自定义添加
- 设置页 Tab 导航：通用/模型管理/MCP/记忆/快捷键 五栏

---

## [0.4.0] - 2026-07-05

### Added

- `get_system_time` 工具：获取当前系统日期和时间
- 多语言支持：7 种语言（中文/英文/日文/韩文/德文/法文/西班牙文）
- 欢迎消息更新：新增系统时间查询能力说明

---

## [0.3.0] - 2026-07-04

### Added

- AI 助手弹窗：编辑器右键触发的快捷指令窗口
- 划词工具栏：选中文字后浮出的工具栏
- 多选模式：消息批量删除和导出

### Changed

- AI 助手弹窗交互流程：初始仅显示输入框，AI 返回后动态插入预览区
- 输入框/预览区高度调整：flex 布局优化

---

## [0.2.0] - 2026-06-XX

### Added

- Anthropic Provider：支持 Claude 模型
- DeepSeek Provider：支持 DeepSeek-V3 和 DeepSeek-R1
- 工具调用循环：LLM 自动调用笔记操作工具
- 历史对话面板：查看和恢复历史对话
- 任务列表面板：提炼任务和逐条执行
- 上下文用量条：token 使用量实时显示

### Changed

- 设置面板按 Provider 分类展示
- Ollama 模型列表支持动态刷新

---

## [0.1.0] - 2026-06-XX

### Added

- 插件基础架构：main.ts、ChatView、MessageHandler
- OpenAI Provider：支持自定义 Base URL
- Ollama Provider：本地模型支持
- 笔记操作工具：创建、编辑、搜索、读取、删除、移动、元数据查询
- 对话面板：多标签页、消息渲染、流式输出
- 设置面板：API Key、模型、温度等配置
- 引用 Chips 系统：@ 符号触发、拖拽引用