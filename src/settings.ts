// ====== MCP 服务器配置 ======
import { McpServerConfig } from "./mcp/McpTypes";
import type { CustomPersona } from "./personas";

// ====== 模型表格项 ======
export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  capabilities: {
    vision: boolean;
    reasoning: boolean;
  };
  enabled: boolean;
  isBuiltin: boolean;
}

/** 自定义 API 供应商（OpenAI 兼容端点，如自建 vLLM、第三方中转、企业网关） */
export interface CustomProvider {
  /** 形如 cp_<时间戳>，路由时以此前缀识别 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 完整基础地址，需包含 /v1，例如 https://api.example.com/v1 */
  baseUrl: string;
  /** API Key，可为空（本地/内网端点无需鉴权） */
  apiKey: string;
  /** 该供应商默认模型名 */
  defaultModel: string;
  /** 标记为非内置 */
  isBuiltin?: false;
}

export interface LLMChatSettings {
  // 界面语言
  language: string;

  // 模型提供商（含 cp_ 前缀的自定义供应商 id）
  provider: string;

  // OpenAI 设置
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;

  // Ollama 设置
  ollamaBaseUrl: string;
  ollamaModel: string;

  // Anthropic 设置
  anthropicApiKey: string;
  anthropicModel: string;

  // DeepSeek 设置
  deepseekApiKey: string;
  deepseekModel: string;

  // Claude Code 设置
  claudeCodeBaseUrl: string;
  claudeCodeModel: string;
  claudeCodeExecutable: string;

  // Codex 设置
  codexBaseUrl: string;
  codexModel: string;
  codexExecutable: string;

  // Gemini 设置
  geminiApiKey: string;
  geminiModel: string;

  // 自定义模型（表格化管理）
  customModels: ModelEntry[];

  // 通用设置
  systemPrompt: string;
  /** 用户保存的自定义人格 */
  personas: CustomPersona[];
  /** 全局默认人格 id（"" 表示无） */
  defaultPersonaId?: string;
  maxTokens: number;
  temperature: number;
  maxConversationHistory: number;
  /** 工具调用最大轮数（学 Copilot Max Iterations）：模型单次回答最多连续调用工具的次数，防止死循环，可配置 */
  maxToolIterations: number;

  // 1M 上下文
  enable1MContext: boolean;

  // ====== MCP 客户端设置 ======
  mcpServers: McpServerConfig[];

  // ====== 记忆系统设置（意识层） ======
  /** 是否启用记忆系统（意识层：自动日记 + 长期画像注入） */
  enableMemory: boolean;
  /** 记忆文件夹路径（相对于 vault 根目录）；其下自动包含 journal/ 与 profile/ 子文件夹 */
  memoryFolderName: string;
  /** 注入 system prompt 时回溯的日记天数 */
  memoryJournalDays: number;
  /** 记忆召回协议（借 MemPalace recall-protocol）：回答前强制先参考用户长期记忆与近期日记，默认开 */
  forceMemoryRecall: boolean;
  /** 画像自动失效天数：超过该天数的 profile 不再注入上下文（0=永不自动失效），磁盘仍保留 */
  memoryProfileMaxAgeDays: number;

  // ====== 沉积层设置 ======
  // 沉积层与记忆系统严格分开：记忆系统存"成品"（摘要、声明记忆），
  // 沉积层只存 AI 思考的"副产物"（被诱导出的放弃思路）。
  /** 是否启用沉积层（总开关；关闭后停止一切沉积、简报与状态栏；默认开启，核心功能） */
  enableSediment: boolean;
  /** 每日简报子开关：开启后 Obsidian 启动时生成当日沉积层日报（需总开关开启） */
  enableSedimentBriefing: boolean;
  /** 沉积层深度分析（Phase 2）：变质/断层/矿脉/反差注入/每日衰减，默认关闭（隐私与性能默认最大） */
  enableSedimentAnalysis: boolean;
  sedimentMetamorph: { n: number; tDays: number; r: number };
  sedimentCaps: { metamorphPerDay: number; faultPerDay: number };
  sedimentInjection: { maxBlocks: number; maxTokens: number; maxCaptureInTokens: number };
  sedimentDecay: { dailyFactor: number };
  sedimentWeight: { survival: number; novelty: number; explore: number; contrast: number };
  // Phase 3 主动进化
  enableSedimentWormhole: boolean; // 实时虫洞（侵入式，默认关）
  sedimentCompactionDays: number; // 压实周期（天）
  sedimentCompactionMinAgeDays: number; // 参与压实的最旧化石年龄（天）
  /** 沉积层文件夹路径（相对于 vault 根目录） */
  sedimentFolderName: string;

  /** 复制划词内容后是否显示提示（默认 true；设为 false 可关闭） */
  showCopyNotice?: boolean;
  enableSelectionToolbar: boolean;
  /** 主栏按钮顺序（含文本工具入口，在数组内即显示），可拖拽排序 */
  selectionToolbarMainOrder: string[];
  /** 文本工具子菜单中已勾选的格式按钮 id（有序） */
  selectionToolbarSubmenuIds: string[];

  /** 赞助链接 */
  sponsorUrl: string;

  /** GitHub Issues 链接（用于反馈） */
  githubIssuesUrl: string;


  /** 自定义 API 供应商列表（OpenAI 兼容端点） */
  customProviders: CustomProvider[];
  /** 各自定义供应商当前选中的模型名（key 为 cp_ id） */
  customProviderModels: Record<string, string>;
}

/** 内置模型列表 */
export const BUILTIN_MODELS: ModelEntry[] = [
  { id: "builtin-openai-gpt4o", name: "gpt-4o", provider: "openai", capabilities: { vision: true, reasoning: true }, enabled: true, isBuiltin: true },
  { id: "builtin-openai-gpt4o-mini", name: "gpt-4o-mini", provider: "openai", capabilities: { vision: true, reasoning: false }, enabled: false, isBuiltin: true },
  { id: "builtin-anthropic-claude-sonnet", name: "claude-3-5-sonnet-20241022", provider: "anthropic", capabilities: { vision: true, reasoning: true }, enabled: true, isBuiltin: true },
  { id: "builtin-anthropic-claude-haiku", name: "claude-3-haiku-20240307", provider: "anthropic", capabilities: { vision: false, reasoning: false }, enabled: false, isBuiltin: true },
  { id: "builtin-deepseek-chat", name: "deepseek-chat", provider: "deepseek", capabilities: { vision: false, reasoning: false }, enabled: true, isBuiltin: true },
  { id: "builtin-deepseek-reasoner", name: "deepseek-reasoner", provider: "deepseek", capabilities: { vision: false, reasoning: true }, enabled: false, isBuiltin: true },
  { id: "builtin-ollama-llama3", name: "llama3", provider: "ollama", capabilities: { vision: false, reasoning: false }, enabled: true, isBuiltin: true },
  { id: "builtin-claudecode-sonnet4", name: "claude-sonnet-4-20250514", provider: "claude-code", capabilities: { vision: true, reasoning: true }, enabled: false, isBuiltin: true },
  { id: "builtin-codex-cli", name: "codex-cli", provider: "codex", capabilities: { vision: false, reasoning: false }, enabled: false, isBuiltin: true },
];

/** 划词工具栏默认按钮顺序（AI 组在前，格式组在后，组间插入分隔线） */
export const DEFAULT_TOOLBAR_MAIN_ORDER: string[] = [
  "ai", "texttool", "translate", "highlight", "ref", "copy", "settings", "task", "table", "file",
];
export const DEFAULT_TOOLBAR_SUBMENU_IDS: string[] = [
  "h2", "h3", "bold", "italic",
];

export const DEFAULT_SETTINGS: LLMChatSettings = {
  language: "zh",

  provider: "openai",

  /** 自定义 API 供应商（默认空） */
  customProviders: [],
  customProviderModels: {},

  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-4o",

  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3",

  anthropicApiKey: "",
  anthropicModel: "claude-3-5-sonnet-20241022",

  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",

  claudeCodeBaseUrl: "http://localhost:8080",
  claudeCodeModel: "claude-code-cli",
  claudeCodeExecutable: "claude",

  codexBaseUrl: "http://localhost:8080",
  codexModel: "codex-cli",
  codexExecutable: "codex",

  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",

  customModels: [],

  systemPrompt: `你是一个 Obsidian 笔记助手，可以帮助用户管理他们的 Obsidian 知识库。
你可以执行以下操作：
- 创建新笔记
- 编辑现有笔记
- 搜索笔记内容
- 读取笔记内容
- 列出目录中的文件
- 删除笔记
- 移动/重命名笔记
- 获取笔记元数据

请用中文回复，除非用户要求使用其他语言。回答要简洁、准确。`,

  personas: [],
  defaultPersonaId: "",
  maxTokens: 4096,
  temperature: 0.7,
  maxConversationHistory: 50,
  maxToolIterations: 15,
  enable1MContext: false,

  mcpServers: [],
  enableMemory: true,
  memoryFolderName: "llm-chat/memory",
  memoryJournalDays: 7,
  forceMemoryRecall: true,
  memoryProfileMaxAgeDays: 0,

  // 沉积层默认开启（核心功能；如需退回实验态可在设置关闭）
  enableSediment: true,
  // 每日简报默认开启（仅当总开关开启时生效）
  enableSedimentBriefing: true,
  // Phase 2 深度分析默认关闭（隐私与性能默认最大）
  enableSedimentAnalysis: false,
  sedimentMetamorph: { n: 3, tDays: 2, r: 1 },
  sedimentCaps: { metamorphPerDay: 10, faultPerDay: 20 },
  sedimentInjection: { maxBlocks: 6, maxTokens: 1500, maxCaptureInTokens: 2000 },
  sedimentDecay: { dailyFactor: 0.9 },
  sedimentWeight: { survival: 0.5, novelty: 0.3, explore: 0.2, contrast: 0.3 },
  // Phase 3 主动进化
  enableSedimentWormhole: false,
  sedimentCompactionDays: 30,
  sedimentCompactionMinAgeDays: 90,
  sedimentFolderName: ".sediment",

  showCopyNotice: true,
    enableSelectionToolbar: true,
    selectionToolbarMainOrder: DEFAULT_TOOLBAR_MAIN_ORDER,
    selectionToolbarSubmenuIds: DEFAULT_TOOLBAR_SUBMENU_IDS,
  sponsorUrl: "https://buymeacoffee.com/yourusername",
  githubIssuesUrl: "https://github.com/Xylocheir/Sedimind/issues",

};
