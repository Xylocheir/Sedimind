# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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

- 多模型支持：OpenAI、Anthropic、Ollama、DeepSeek、Claude Code、Codex
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