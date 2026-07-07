# 贡献指南

欢迎贡献代码！本文档描述了如何为 Sedimind 插件贡献代码。

---

## 开发环境

### 前置条件

- Node.js >= 18.x
- npm >= 9.x
- Obsidian >= 1.5.0

### 设置开发环境

```bash
# 克隆仓库
git clone https://github.com/Xylocheir/Sedimind.git
cd Sedimind

# 安装依赖
npm install

# 开发模式（自动重新编译）
npm run dev
```

### 测试插件

1. 在 Obsidian 中，创建一个测试 vault
2. 在 vault 的 `.obsidian/plugins/` 目录下创建 `Sedimind` 文件夹
3. 使用符号链接将项目目录链接到插件目录：

```bash
# macOS/Linux
ln -s /path/to/your/project/Sedimind /path/to/vault/.obsidian/plugins/Sedimind

# Windows（PowerShell）
New-Item -ItemType SymbolicLink -Path "C:\path\to\vault\.obsidian\plugins\Sedimind" -Target "C:\path\to\your\project\Sedimind"
```

4. 重启 Obsidian → 设置 → 社区插件 → 启用 "Sedimind"

---

## 代码规范

### 命名规范

- **文件命名**：PascalCase（如 `ChatView.ts`）
- **工具文件**：PascalCase + Tool 后缀（如 `CreateNoteTool.ts`）
- **TypeScript 接口**：PascalCase（如 `LLMProvider`）
- **变量**：camelCase
- **函数**：camelCase，动词开头
- **CSS 类名**：kebab-case，`llm-chat-` 前缀

### 注释要求

- **公共 API**：JSDoc 格式，包含 `@param`、`@returns`
- **非显而易见的算法**：一行注释说明意图
- **HACK / TODO / FIXME**：注明原因和预期修复版本

### TypeScript 配置

- `noImplicitAny`: true
- `strictNullChecks`: true
- 禁止使用 `any` 类型（如无充分理由）

### 错误处理

- 所有异步调用必须有 `.catch()` 或 `try/catch`
- `fetch()` 响应必须先检查 `response.ok`
- 文件操作必须包 `try/catch`

---

## 提交规范

### Commit 信息格式

```
type(scope): description
```

**type 可选值**：
- `feat` - 新功能
- `fix` - 修复 Bug
- `refactor` - 重构（不改变功能）
- `docs` - 文档更新
- `style` - 代码格式调整
- `test` - 测试相关
- `chore` - 构建/工具相关

**示例**：
```
feat(chat): 添加消息区设置面板功能
fix(menu): 修复引用菜单首次打开位置错误
refactor(llm): 重构 Provider 接口
docs(readme): 更新安装说明
```

### Pull Request 规范

1. **一个 PR 只做一件事**：禁止混合功能开发、重构、格式调整
2. **描述清楚**：说明修改的目的、实现方式、测试方法
3. **通过编译**：确保 `npm run build` 无错误
4. **更新文档**：如有需要，更新 README.md、CHANGELOG.md

---

## 功能开发流程

### 1. 提出需求

在 GitHub Issues 中提出功能需求或 Bug 报告，描述：
- 需求背景
- 预期行为
- 实际行为（如 Bug）
- 复现步骤

### 2. 讨论方案

与维护者讨论实现方案，确认技术细节。

### 3. 开发实现

- 创建功能分支
- 实现功能
- 添加必要的注释
- 测试功能

### 4. 提交 PR

- 提交代码到功能分支
- 创建 Pull Request
- 等待审核

---

## Bug 修复流程

### 1. 报告 Bug

在 GitHub Issues 中报告 Bug，包含：
- Obsidian 版本
- 插件版本
- 复现步骤
- 预期行为
- 实际行为
- 截图（如有）

### 2. 定位问题

- 根据复现步骤定位问题
- 检查相关代码
- 分析根因

### 3. 修复验证

- 实现修复
- 验证修复效果
- 确保没有引入新问题

### 4. 提交 PR

- 提交修复代码
- 在 PR 中描述修复内容和验证方法

---

## 文档贡献

### 更新文档

- README.md：项目介绍、安装、使用说明
- CHANGELOG.md：版本变更记录
- UsageGuide.md：详细使用说明
- rules.md：开发规范（内部文档）
- Features.md：功能统计（内部文档）

### 文档规范

- 使用 Markdown 格式
- 中英文混合使用（标题英文，内容中文）
- 保持格式统一
- 使用清晰的层次结构

---

## 测试

### 手动测试

每个功能变更都需要进行手动测试：

1. **基本功能测试**：确保核心功能正常工作
2. **边界条件测试**：测试极端情况
3. **回归测试**：确保修改没有影响其他功能
4. **兼容性测试**：在不同 Obsidian 版本上测试

### 测试清单

- [ ] 插件可正常安装和启用
- [ ] 设置面板可正常配置
- [ ] 对话功能正常（发送、接收、流式输出）
- [ ] 工具调用正常（创建、编辑、搜索笔记等）
- [ ] 引用系统正常（@ 菜单、拖拽引用）
- [ ] 历史面板正常（加载、删除）
- [ ] 设置面板正常（打开、关闭、滚动）
- [ ] AI 助手弹窗正常（打开、拖拽、预览、确认）
- [ ] 划词工具栏正常（弹出、操作）
- [ ] 多语言切换正常
- [ ] 模型切换正常

---

## 联系我们

如有问题或建议，欢迎通过以下方式联系：

- GitHub Issues：https://github.com/Xylocheir/Sedimind/issues
- Discussions：https://github.com/Xylocheir/Sedimind/discussions

感谢你的贡献！