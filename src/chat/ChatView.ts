import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component, Notice, TFolder, TFile } from "obsidian";
import { MessageHandler, UICallbacks } from "./MessageHandler";
import { LLMChatSettings } from "../settings";
import { t, Language } from "../i18n";
import { Icons } from "../icons";
import { ChatMessage, LLMProvider } from "../llm/LLMProvider";
import { AtMenu, AtReferenceData } from "./AtMenu";
import { McpManager } from "../mcp/McpManager";
import { MemoryManager } from "../memory/MemoryManager";
import { SedimentManager } from "../sediment/SedimentManager";
import { getAllPersonas, resolvePersonaPrompt } from "../personas";
import {
  OpenAIProvider,
  OllamaProvider,
  AnthropicProvider,
  DeepSeekProvider,
  ClaudeCodeProvider,
  CodexProvider,
  GeminiProvider,
} from "../llm/index";
import { SettingsRenderer } from "../SettingsRenderer";

export const CHAT_VIEW_TYPE = "llm-chat-view";

const HISTORY_RETENTION_DAYS = 7;
const HISTORY_KEY = "_llmChatHistory";

/** 上下文窗口大小估算（tokens） */
const CTX_WINDOWS: Record<string, number> = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16384,
  "claude-3-5-sonnet-20241022": 200000,
  "claude-3-opus-20240229": 200000,
  "claude-3-sonnet-20240229": 200000,
  "claude-3-haiku-20240307": 200000,
  "claude-sonnet-4-20250514": 200000,
  "deepseek-chat": 65536,
  "deepseek-reasoner": 65536,
  "llama3": 8192,
  "llama3.1": 128000,
  "llama3.2": 128000,
  "mistral": 32768,
  "qwen": 32768,
  "codex-cli": 128000,
};

interface ChatTab {
  id: string;
  title: string;
  handler: MessageHandler;
  containerEl: HTMLElement;
  currentAssistantMsg: HTMLElement | null;
  isStreaming: boolean;
  tabBtn: HTMLElement;
  /** 标签页数字/标题文本节点（与人格按钮分离，避免 renumber 覆盖） */
  numEl: HTMLElement;
  /** 标签页上的独立人格选择按钮 */
  personaBtnEl: HTMLElement;
  isDefaultTitle: boolean;
  autoScroll: boolean;
  /** 当前标签页选中的人格 id；null/"" 表示使用全局默认系统提示词 */
  personaId: string | null;
}

export interface ConversationRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  customTitle?: boolean;
  /** 标签页级人格 id */
  personaId?: string | null;
}

interface ModelOption {
  provider: string;
  model: string;
  label: string;
}

/** 笔记引用项 */
interface NoteReference {
  path: string;
  name: string;
}

/** 内联 Chip 数据 */
interface InlineChipData {
  type: "note" | "folder" | "url" | "file" | "selection" | "image";
  path?: string;
  url?: string;
  name: string;
  text?: string;
}

export class ChatView extends ItemView {
  private settings: LLMChatSettings;
  private chatContainer: HTMLElement;
  private settingsRenderer: SettingsRenderer | null = null;
  private inputEl: HTMLDivElement;
  // 工具栏根元素（buildToolbar 当前未被调用；使用断言以满足严格空检查）
  private toolbarEl!: HTMLElement;
  // 上下文用量文字标签（可选，当前未赋值）
  private contextLabelEl: HTMLElement | null = null;
  private sendBtn: HTMLButtonElement;

  private statusEl: HTMLElement;
  private tabBar: HTMLElement;
  private modelSelectEl: HTMLSelectElement | null = null;
  private personaSelectEl: HTMLSelectElement | null = null;
  private contextFillEl: HTMLElement;
  private toolbarContextFillEl: HTMLElement | null = null;
  private bottomBar: HTMLElement;
  private inputContextFillEl: HTMLElement | null = null;
  private inputContextTextEl: HTMLElement | null = null;

  private tabs: ChatTab[] = [];
  private activeTabId: string | null = null;
  private msgNavEl: HTMLElement | null = null;
  private msgNavNodes: { msgEl: HTMLElement; navEl: HTMLElement }[] = [];
  private msgNavBoundContainers: Set<HTMLElement> = new Set();
  private noteReferences: NoteReference[] = [];
  private folderReferences: { path: string; name: string }[] = [];
  private urlReferences: { url: string; name: string }[] = [];
  private attachedFiles: string[] = [];
  private selectionText: string = "";
  private selectionFilePath: string = "";
  private onSaveHistory: () => Promise<void>;
  private onLoadSettings: () => Promise<LLMChatSettings>;
  private onSaveSettings: (s: LLMChatSettings) => Promise<void>;
  private mcpManager: McpManager | null = null;
  private memoryManager: MemoryManager | null = null;
  private sedimentManager: SedimentManager | null = null;


  private generatingTabId: string | null = null;
  private editingState: {
    tab: ChatTab;
    msgEl: HTMLElement;
    origContent: string;
    textarea: HTMLTextAreaElement;
    measureSpan: HTMLSpanElement;
  } | null = null;

  // @ 引用菜单
  private atMenu: AtMenu | null = null;

  // 内联 Chip（嵌入在 contentEditable 输入框中）
  private inlineChipMap: Map<string, InlineChipData> = new Map();
  private pendingAtNode: Text | null = null;
  private pendingAtOffset: number = -1;
  // 保存打开 @ 菜单前的光标位置，防止菜单关闭后焦点丢失导致插入到开头
  private savedCursorRange: Range | null = null;

  private get lang(): Language {
    return (this.settings.language as Language) || "zh";
  }

  private str(key: string, params?: Record<string, string>): string {
    return t(key, this.lang, params);
  }

  constructor(
    leaf: WorkspaceLeaf,
    settings: LLMChatSettings,
    onSaveHistory: () => Promise<void>,
    onLoadSettings: () => Promise<LLMChatSettings>,
    onSaveSettings: (s: LLMChatSettings) => Promise<void>,
    mcpManager?: McpManager,
    memoryManager?: MemoryManager,
    sedimentManager?: SedimentManager
  ) {
    super(leaf);
    this.settings = settings;
    this.onSaveHistory = onSaveHistory;
    this.onLoadSettings = onLoadSettings;
    this.onSaveSettings = onSaveSettings;
    this.mcpManager = mcpManager || null;
    this.memoryManager = memoryManager || null;
    this.sedimentManager = sedimentManager || null;
  }

  getViewType(): string { return CHAT_VIEW_TYPE; }
  getDisplayText(): string { return this.str("displayName"); }
  getIcon(): string { return "bot"; }

  async updateSettings(settings: LLMChatSettings): Promise<void> {
    this.settings = settings;
    for (const tab of this.tabs) tab.handler.updateSettings(settings);
    await this.refreshUI();
  }

  // ==================== UI 刷新 ====================

  private async refreshUI(): Promise<void> {
    if (this.inputEl) this.inputEl.setAttr("data-placeholder", this.str("inputPlaceholder"));
    if (this.sendBtn && !this.generatingTabId) this.sendBtn.setAttr("title", this.str("sendButton"));

    this.updateStatusLogo();

    // 更新底部工具栏按钮 tooltip
    const refBtn = this.bottomBar.querySelector(".llm-chat-ref-btn");
    const settingsBtn = this.bottomBar.querySelector(".llm-chat-settings-btn");

    const historyBtn = this.bottomBar.querySelector(".llm-chat-history-btn");
    const lightbulbBtn = this.bottomBar.querySelector(".llm-chat-lightbulb-btn");
    if (refBtn) refBtn.setAttr("title", this.str("referenceNote"));
    if (settingsBtn) settingsBtn.setAttr("title", "设置");

    if (historyBtn) historyBtn.setAttr("title", this.str("historyTitle"));
    if (lightbulbBtn) lightbulbBtn.setAttr("title", "智能分析");

    // 更新模型名称
    const modelName = this.bottomBar.querySelector(".llm-chat-toolbar-model-name");
    if (modelName) modelName.setText(this.getCurrentModel());

    // 更新上下文标签
    this.updateContextBar();

    // 更新标签页（Pixso 风格：数字标签不需要更新标题）
    const addBtn = this.tabBar.querySelector(".llm-chat-tab-add");
    if (addBtn) {
      addBtn.setAttr("title", this.str("newTabTitle"));
    }
    for (const tab of this.tabs) {
      const welcomeEl = tab.containerEl.querySelector(".llm-chat-welcome");
      if (welcomeEl) {
        const header = welcomeEl.querySelector(".llm-chat-header");
        const body = welcomeEl.querySelector(".llm-chat-body");
        if (header) header.setText(this.str("welcomeHeader"));
        if (body) body.innerHTML = this.str("welcomeBody");
      }
    }

    // 更新显示名称（标签页标题）
    this.getDisplayText();
  }

  resetChat(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.handler.resetConversation();
    tab.containerEl.empty();
    this.addWelcomeMessage(tab);
    this.updateStatusLogo();
    tab.currentAssistantMsg = null;
    tab.isStreaming = false;
    this.noteReferences = [];
    this.folderReferences = [];
    this.urlReferences = [];
    this.attachedFiles = [];
    this.selectionText = "";
    this.selectionFilePath = "";
    this.updateContextBar();
  }

  setInputText(text: string): void {
    if (this.inputEl) {
      this.clearInlineInput();
      this.insertTextAtCursor(text);
    }
  }

  // ==================== 构建界面 ====================

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("llm-chat-container");

    // ---- 状态栏（模型 logo） ----
    this.statusEl = container.createDiv("llm-chat-status");
    this.updateStatusLogo();

    // ---- 消息区域 ----
    this.chatContainer = container.createDiv("llm-chat-messages-wrapper");
    // 消息导航条（快速定位用户消息）
    this.msgNavEl = this.chatContainer.createDiv("llm-chat-msg-nav");

    // ---- 标签栏 ----
    this.tabBar = container.createDiv("llm-chat-tab-bar");

    // ---- 输入区 ----
    const inputContainer = container.createDiv("llm-chat-input-container");

    // 输入卡片（白色圆角背景，绿色主题色边框）
    const inputCard = inputContainer.createDiv("llm-chat-input-card");

    // 输入框（contentEditable 支持内联 Chip）
    this.inputEl = inputCard.createDiv("llm-chat-input");
    this.inputEl.setAttr("contenteditable", "true");
    this.inputEl.setAttr("role", "textbox");
    this.inputEl.setAttr("aria-multiline", "true");
    this.inputEl.setAttr("data-placeholder", this.str("inputPlaceholder"));

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
        return;
      }
      // Backspace 删除 Chip：当光标在 Chip 后面时，选中它
      if (e.key === "Backspace") {
        this.handleChipBackspace();
      }
    });

    // 用 beforeinput 拦截 @ 输入（在字符真正插入前触发，比 input 更可靠）
    this.inputEl.addEventListener("beforeinput", (e: InputEvent) => {
      if (e.data === "@" && (e.inputType === "insertText" || e.inputType === "insertReplacementText")) {
        // 阻止默认行为，改由程序手动插入 @ 并触发菜单
        e.preventDefault();
        this.handleAtSymbolInput();
      }
    });

    this.inputEl.addEventListener("input", () => {
      this.autoResizeInput();
    });

    // 粘贴时：图片粘贴放行（由 inputContainer 的 initPasteImage 处理），纯文本粘贴只保留文本
    this.inputEl.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith("image/")) {
            return; // 图片粘贴 → 放行，由容器级 handler 处理
          }
        }
      }
      e.preventDefault();
      const text = (e.clipboardData || (window as any).clipboardData).getData("text/plain");
      if (!text) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      this.autoResizeInput();
    });

    // ---- 输入卡片底部工具栏（Pixso 设计稿样式）----
    const inputToolbar = inputCard.createDiv("llm-chat-input-toolbar");
    this.bottomBar = inputToolbar;

    // 左侧：@ 引用 + 历史 + 设置
    const toolbarLeft = inputToolbar.createDiv("llm-chat-toolbar-left");

    const refBtn = toolbarLeft.createEl("button", { cls: "llm-chat-toolbar-btn llm-chat-toolbar-circle llm-chat-ref-btn" });
    refBtn.innerHTML = Icons.pixsoAtSign(19);
    refBtn.setAttr("title", this.str("referenceNote"));
    refBtn.addEventListener("click", () => this.openNotePicker());

    const historyBtn = toolbarLeft.createEl("button", { cls: "llm-chat-toolbar-btn llm-chat-toolbar-circle llm-chat-history-btn" });
    historyBtn.innerHTML = Icons.pixsoHistory(17);
    historyBtn.setAttr("title", "对话历史");
    historyBtn.addEventListener("click", () => this.toggleHistoryPanel());


    const settingsBtn = toolbarLeft.createEl("button", { cls: "llm-chat-toolbar-btn llm-chat-toolbar-circle llm-chat-settings-btn" });
    settingsBtn.innerHTML = Icons.pixsoSettings(17);
    settingsBtn.setAttr("title", "设置");
    settingsBtn.addEventListener("click", () => this.toggleSettingsPanel());

    // 中部：可点击模型名称
    const toolbarCenter = inputToolbar.createDiv("llm-chat-toolbar-center");
    const modelNameBtn = toolbarCenter.createEl("button", { cls: "llm-chat-toolbar-model-name" });
    modelNameBtn.setText(this.getCurrentModel());
    modelNameBtn.setAttr("title", this.str("modelLabel"));
    modelNameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showModelPicker(modelNameBtn);
    });

    // 右侧：发送
    const toolbarRight = inputToolbar.createDiv("llm-chat-toolbar-right");

    // 发送按钮（绿色圆形，AI 回复时变为红色停止）
    const sendCircle = toolbarRight.createEl("button", {
      cls: "llm-chat-send-circle-btn",
    });
    sendCircle.innerHTML = Icons.pixsoSend(14);
    sendCircle.setAttr("title", this.str("sendButton"));
    sendCircle.addEventListener("click", () => {
      if (this.generatingTabId) {
        this.stopGeneration();
      } else if (this.editingState) {
        this.commitEditAndSend();
      } else {
        this.sendMessage();
      }
    });
    this.sendBtn = sendCircle as unknown as HTMLButtonElement;

    // ---- 输入框下方上下文占用条（按设计稿：绿色胶囊 + 白色进度 + 白色文字）----
    const inputCtxBar = inputContainer.createDiv("llm-chat-input-context-bar");
    const inputCtxTrack = inputCtxBar.createDiv("llm-chat-input-context-track");
    this.inputContextFillEl = inputCtxTrack.createDiv("llm-chat-input-context-fill");
    this.inputContextTextEl = inputCtxBar.createDiv("llm-chat-input-context-text");
    this.updateContextBar();

    // 拖拽文件到输入区自动生成引用
    this.initDragDrop(inputContainer);

    // 粘贴图片支持
    this.initPasteImage(inputContainer);

    // 对话消息区右键菜单
    this.initMessageContextMenu(this.chatContainer);

    this.addTab(true);

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const activeLeaf = this.app.workspace.getActiveViewOfType(ChatView);
        if (activeLeaf === this) {
          this.closeSettingsPanel();
          this.closeHistoryPanel();
          this.restoreMessageContent();
        }
      })
    );
  }

  async onClose(): Promise<void> {
    await this.saveCurrentConversations();
  }

  // ==================== 状态栏（模型 Logo） ====================

  private updateStatusLogo(): void {
    this.statusEl.empty();
    const iconEl = this.statusEl.createSpan("llm-chat-status-icon");
    iconEl.innerHTML = Icons.getProviderIcon(this.settings.provider, 14);
    const textEl = this.statusEl.createSpan("llm-chat-status-text");
    textEl.setText(Icons.getProviderLabel(this.settings.provider));
    const modelEl = this.statusEl.createSpan("llm-chat-status-model");
    modelEl.setText(this.getCurrentModel());
  }

  // ==================== 工具栏 ====================

  private populatePersonaSelect(): void {
    if (!this.personaSelectEl) return;
    const sel = this.personaSelectEl;
    sel.empty();
    sel.createEl("option", { text: "默认（全局）", value: "" });
    for (const p of getAllPersonas(this.settings)) {
      sel.createEl("option", { text: p.icon + " " + p.name, value: p.id });
    }
    const active = this.getActiveTab();
    sel.value = active && active.personaId ? active.personaId : "";
  }

  private async buildToolbar(): Promise<void> {
    this.toolbarEl.empty();

    // 模型选择 + 进度条包装容器
    const modelWrap = this.toolbarEl.createDiv("llm-chat-toolbar-model-wrap");

    const modelSelect = modelWrap.createEl("select", { cls: "llm-chat-model-select" });
    modelSelect.setAttr("title", this.str("modelLabel"));

    // 模型选择框下方的上下文进度条（仅进度条，无文字）
    const toolbarCtxBar = modelWrap.createDiv("llm-chat-toolbar-context-bar");
    this.toolbarContextFillEl = toolbarCtxBar.createDiv("llm-chat-toolbar-context-fill");

    const populate = async () => {
      modelSelect.empty();
      const options = await this.getModelOptions();
      for (const opt of options) {
        const optEl = modelSelect.createEl("option", {
          text: opt.label,
          value: `${opt.provider}::${opt.model}`,
        });
        if (opt.provider === this.settings.provider && opt.model === this.getCurrentModel()) {
          optEl.selected = true;
        }
      }
    };

    await populate();

    modelSelect.addEventListener("change", async () => {
      const [provider, model] = modelSelect.value.split("::");
      const newSettings = { ...this.settings, provider: provider as LLMChatSettings["provider"] };
      if (provider === "openai") newSettings.openaiModel = model;
      else if (provider === "anthropic") newSettings.anthropicModel = model;
      else if (provider === "deepseek") newSettings.deepseekModel = model;
      else if (provider === "ollama") newSettings.ollamaModel = model;
      else if (provider === "claude-code") newSettings.claudeCodeModel = model;
      else if (provider === "codex") newSettings.codexModel = model;
      else if (provider === "gemini") newSettings.geminiModel = model;
      else if (provider.startsWith("cp_")) {
        // 自定义 API 供应商：记录各自选中的模型名
        newSettings.customProviderModels = {
          ...(this.settings.customProviderModels || {}),
          [provider]: model,
        };
      }
      this.settings = newSettings;
      for (const tab of this.tabs) tab.handler.updateSettings(newSettings);
      this.updateStatusLogo();
      this.updateContextBar();
      await this.onSaveSettings(newSettings);
    });

    // 人格（AI 智能体）选择器——按标签页生效
    const personaWrap = this.toolbarEl.createDiv("llm-chat-toolbar-item llm-chat-persona-wrap");
    const personaLabel = personaWrap.createSpan("llm-chat-toolbar-label");
    personaLabel.setText("智能体");
    const personaSelect = personaWrap.createEl("select", { cls: "llm-chat-model-select llm-chat-persona-select" });
    personaSelect.addEventListener("change", () => {
      const id = personaSelect.value;
      const tab = this.getActiveTab();
      if (!tab) return;
      tab.personaId = id || null;
      const prompt = id ? resolvePersonaPrompt(id, this.settings) : null;
      tab.handler.setCustomSystemPrompt(prompt);
      this.updateTabPersonaBtn(tab.personaBtnEl, tab.personaId);
      if (tab.handler.getMessages().filter((m) => m.role !== "system").length > 0) {
        this.saveTabToHistory(tab);
      }
    });
    this.personaSelectEl = personaSelect;
    this.populatePersonaSelect();
  }

  private getCurrentModel(): string {
    if (this.settings.provider.startsWith("cp_")) {
      const cp = this.settings.customProviders.find((c) => c.id === this.settings.provider);
      const models = this.settings.customProviderModels || {};
      return (cp && models[cp.id]) || (cp ? cp.defaultModel : "");
    }
    switch (this.settings.provider) {
      case "openai": return this.settings.openaiModel;
      case "anthropic": return this.settings.anthropicModel;
      case "deepseek": return this.settings.deepseekModel;
      case "ollama": return this.settings.ollamaModel;
      case "claude-code": return this.settings.claudeCodeModel;
      case "codex": return this.settings.codexModel;
      case "gemini": return this.settings.geminiModel;
      default: return this.settings.openaiModel;
    }
  }

  private async getModelOptions(): Promise<ModelOption[]> {
    const options: ModelOption[] = [];
    const s = this.settings;

    // 仅显示已配置API Key的云端模型
    if (s.openaiApiKey.trim()) {
      options.push({ provider: "openai", model: s.openaiModel, label: `OpenAI / ${s.openaiModel}` });
    }
    if (s.anthropicApiKey.trim()) {
      options.push({ provider: "anthropic", model: s.anthropicModel, label: `Anthropic / ${s.anthropicModel}` });
    }
    if (s.deepseekApiKey.trim()) {
      options.push({ provider: "deepseek", model: s.deepseekModel, label: `DeepSeek / ${s.deepseekModel}` });
    }
    if (s.claudeCodeBaseUrl.trim()) {
      options.push({ provider: "claude-code", model: s.claudeCodeModel, label: `Claude Code / ${s.claudeCodeModel}` });
    }
    if (s.codexBaseUrl.trim()) {
      options.push({ provider: "codex", model: s.codexModel, label: `Codex / ${s.codexModel}` });
    }
    if (s.geminiApiKey.trim()) {
      options.push({ provider: "gemini", model: s.geminiModel, label: `Gemini / ${s.geminiModel}` });
    }

    // Ollama 本地模型：拉取所有已部署的模型
    try {
      const ollamaModels = await OllamaProvider.fetchModels(s.ollamaBaseUrl);
      if (ollamaModels.length > 0) {
        for (const m of ollamaModels) {
          options.push({ provider: "ollama", model: m.name, label: `Ollama / ${m.name}` });
        }
      } else {
        // Ollama 未运行或未检测到模型时，仍显示已配置的模型
        if (s.ollamaModel) {
          options.push({ provider: "ollama", model: s.ollamaModel, label: `Ollama / ${s.ollamaModel}` });
        }
      }
    } catch {
      // Ollama 不可用时，显示已配置模型
      if (s.ollamaModel) {
        options.push({ provider: "ollama", model: s.ollamaModel, label: `Ollama / ${s.ollamaModel}` });
      }
    }

    // 自定义 API 供应商（OpenAI 兼容端点），apiKey 可选故无需判断
    for (const cp of this.settings.customProviders) {
      const models = this.settings.customProviderModels || {};
      const model = models[cp.id] || cp.defaultModel;
      options.push({ provider: cp.id, model, label: `${cp.name} / ${model}` });
    }

    return options;
  }

  // ==================== 标签页 ====================

  /** 创建标签页按钮：数字编号 + 独立人格选择按钮（点击不触发切换） */
  private buildTabButton(id: string, onPersonaClick: (anchor: HTMLElement) => void): {
    tabBtn: HTMLElement; numEl: HTMLElement; personaBtn: HTMLElement;
  } {
    const tabBtn = this.tabBar.createDiv("llm-chat-tab");
    tabBtn.setAttr("data-tab-id", id);

    const numEl = tabBtn.createSpan("llm-chat-tab-num");
    numEl.setText("");

    const personaBtn = tabBtn.createDiv("llm-chat-tab-persona");
    this.updateTabPersonaBtn(personaBtn, null);
    personaBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      onPersonaClick(personaBtn);
    });

    tabBtn.addEventListener("click", () => this.switchTab(id));
    tabBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeTab(id);
    });

    return { tabBtn, numEl, personaBtn };
  }

  /** 根据人格 id 更新标签页人格按钮的图标与提示 */
  private updateTabPersonaBtn(btn: HTMLElement | null, personaId: string | null): void {
    if (!btn) return;
    const p = personaId ? getAllPersonas(this.settings).find((x) => x.id === personaId) : null;
    btn.setText(p ? p.icon : "🤖");
    btn.setAttr("title", p ? p.icon + " " + p.name : "默认（全局）");
  }

  /** 标签页级人格选择弹窗（复用模型选择弹窗样式） */
  private showTabPersonaPicker(tab: ChatTab, anchor: HTMLElement): void {
    const existing = document.querySelector(".llm-chat-model-picker");
    if (existing) { existing.remove(); return; }

    const picker = document.createElement("div");
    picker.className = "llm-chat-model-picker";

    const addItem = (label: string, value: string) => {
      const item = picker.createDiv("llm-chat-model-picker-item");
      item.setText(label);
      if (tab.personaId === value) item.addClass("selected");
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        tab.personaId = value || null;
        const prompt = value ? resolvePersonaPrompt(value, this.settings) : null;
        tab.handler.setCustomSystemPrompt(prompt);
        this.updateTabPersonaBtn(tab.personaBtnEl, tab.personaId);
        this.populatePersonaSelect(); // 同步工具栏选择器
        if (tab.handler.getMessages().filter((m) => m.role !== "system").length > 0) {
          this.saveTabToHistory(tab);
        }
        picker.remove();
      });
    };

    addItem("默认（全局）", "");
    for (const p of getAllPersonas(this.settings)) addItem(p.icon + " " + p.name, p.id);

    const close = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);

    document.body.appendChild(picker);
    const rect = anchor.getBoundingClientRect();
    picker.style.position = "fixed";
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.top - 4}px`;
    picker.style.transform = "translateY(-100%)";
  }

  private addTab(focus: boolean, forceId?: string, forceTitle?: string, personaId?: string | null): void {
    if (this.tabs.length >= 7) return;
    const id = forceId || this.generateId();
    const title = forceTitle || this.str("defaultTabTitle");

    const containerEl = this.chatContainer.createDiv("llm-chat-tab-content");
    containerEl.setAttr("data-tab-id", id);

    containerEl.addEventListener("scroll", () => {
      const tab = this.tabs.find(t => t.id === id);
      if (!tab) return;
      const isAtBottom = containerEl.scrollTop + containerEl.clientHeight >= containerEl.scrollHeight - 50;
      tab.autoScroll = isAtBottom;
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const tab = this.tabs.find(t => t.id === id);
      if (!tab || !tab.isStreaming) return;
      const scrollKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
      if (scrollKeys.includes(e.key)) {
        tab.autoScroll = false;
      }
    };
    containerEl.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleKeyDown);

    const ui: UICallbacks = {
      onUserMessage: (content) => this.addUserMessage(id, content),
      onAssistantChunk: (content) => this.updateStreamingMessage(id, content),
      onAssistantMessage: (content) => this.finalizeStreamingMessage(id, content),
      onToolCall: (name, args) => this.addToolCallBubble(id, name, args),
      onToolResult: (name, result) => this.addToolResultBubble(id, name, result),
      onError: (message) => this.addErrorBubble(id, message),
      onThinking: (thinking) => this.setThinking(thinking),
    };

    const handler = new MessageHandler(this.app, this.settings, ui, undefined, this.mcpManager || undefined, this.memoryManager || undefined, this.sedimentManager || undefined);

    const { tabBtn, numEl, personaBtn } = this.buildTabButton(id, (anchor) => this.showTabPersonaPicker(tab, anchor));
    // Pixso 风格：标签页默认显示数字编号；指定标题时显示标题前几个字
    numEl.setText(forceTitle ? (forceTitle.length > 8 ? forceTitle.substring(0, 8) : forceTitle) : String(this.tabs.length + 1));

    const tab: ChatTab = {
      id, title, handler, containerEl,
      currentAssistantMsg: null, isStreaming: false,
      tabBtn, numEl, personaBtnEl: personaBtn,
      isDefaultTitle: !forceTitle,
      autoScroll: true,
      personaId: personaId ?? null,
    };
    this.updateTabPersonaBtn(personaBtn, tab.personaId);

    this.tabs.push(tab);
    this.addWelcomeMessage(tab);

    if (focus) this.switchTab(id);

    this.ensureAddTabButton();
    this.renumberTabs();
  }

  private switchTab(id: string): void {
    for (const t of this.tabs) {
      t.containerEl.hide();
      t.tabBtn.removeClass("active");
    }
    const tab = this.tabs.find((t) => t.id === id);
    if (tab) {
      this.activeTabId = id;
      tab.containerEl.show();
      tab.tabBtn.addClass("active");
      tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
      this.updateContextBar();
      this.rebuildMsgNav();
      this.populatePersonaSelect();
    }
  }

  private closeTab(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    this.saveTabToHistory(tab);
    tab.containerEl.remove();
    tab.tabBtn.remove();
    this.tabs.splice(idx, 1);
    if (this.activeTabId === id) {
      if (this.tabs.length > 0) {
        this.switchTab(this.tabs[Math.min(idx, this.tabs.length - 1)].id);
      } else {
        this.addTab(true);
      }
    }
    this.ensureAddTabButton();
    this.renumberTabs();
  }

  private ensureAddTabButton(): void {
    const existing = this.tabBar.querySelector(".llm-chat-tab-add");
    if (existing) existing.remove();
    if (this.tabs.length >= 7) return;
    const addBtn = this.tabBar.createDiv("llm-chat-tab llm-chat-tab-add");
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/></svg>`;
    addBtn.setAttr("title", this.str("newTabTitle"));
    addBtn.addEventListener("click", () => this.addTab(true));
  }

  /** 重新给所有标签页编号（Pixso 风格：1, 2, 3...） */
  private renumberTabs(): void {
    this.tabs.forEach((tab, i) => {
      if (tab.numEl) tab.numEl.setText(String(i + 1));
    });
  }

  /** 标签栏右侧按钮已移除（清空对话、历史对话） */
  private addHistoryToTabBar(): void {
    // 已移除：清空对话和历史对话按钮不再显示
  }

  private getActiveTab(): ChatTab | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  private getTab(id: string): ChatTab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  // ==================== 引用笔记 & 文件附件 ====================

  /** 点击 @ 按钮 → 打开 @ 引用菜单 */
  private openNotePicker(): void {
    this.showAtMenu(false);
  }

  /** beforeinput 拦截到 @ 输入，手动插入并打开菜单 */
  private handleAtSymbolInput(): void {
    if (!this.inputEl) return;

    // 手动在光标处插入 @ 字符
    this.inputEl.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const atNode = document.createTextNode("@");
    range.deleteContents();
    range.insertNode(atNode);
    range.setStartAfter(atNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // 保存 @ 位置（用于后续删除 @ 及搜索文本）
    this.pendingAtNode = atNode;
    this.pendingAtOffset = 0;

    // 立即打开 @ 菜单（showAtMenu 内部会自动保存光标位置）
    this.showAtMenu(true);
  }

  /** 输入 @ 符号 → 打开 @ 引用菜单（替换模式） */
  private openAtReferenceMenu(): void {
    this.showAtMenu(true);
  }

  /** 统一的 @ 引用菜单入口 */
  private showAtMenu(isFromAtSign: boolean): void {
    // 保存当前光标位置（用于后续 Chip 插入时定位，防止菜单关闭后 focus 丢失光标）
    const sel = window.getSelection();
    if (sel && sel.rangeCount && this.inputEl && this.inputEl.contains(sel.anchorNode)) {
      this.savedCursorRange = sel.getRangeAt(0).cloneRange();
    }
    if (this.atMenu) {
      this.atMenu.close();
      this.atMenu = null;
    }

    const anchorEl = this.inputEl;

    this.atMenu = new AtMenu(
      this.app,
      this.lang,
      (data: AtReferenceData) => {
        this.onAtMenuSelect(data);
      },
      () => {
        this.atMenu = null;
        this.pendingAtNode = null;
        this.pendingAtOffset = -1;
        this.savedCursorRange = null;
      }
    );

    this.atMenu.show(anchorEl, this.inputEl as unknown as HTMLTextAreaElement, 0, isFromAtSign);
  }

  /** 处理 @ 菜单选择 */
  private onAtMenuSelect(data: AtReferenceData): void {
    switch (data.type) {
      case "note":
        this.insertInlineChip("note", data.name, { path: data.path });
        // 同时保持旧引用数组供 sendMessage 使用
        if (!this.noteReferences.find((r) => r.path === data.path)) {
          this.noteReferences.push({ path: data.path!, name: data.name });
        }
        break;
      case "folder":
        this.insertInlineChip("folder", data.name, { path: data.path });
        if (!this.folderReferences.find((r) => r.path === data.path)) {
          this.folderReferences.push({ path: data.path!, name: data.name });
        }
        break;
      case "url":
        this.insertInlineChip("url", data.name, { url: data.url });
        if (!this.urlReferences.find((r) => r.url === data.url)) {
          this.urlReferences.push({ url: data.url!, name: data.name });
        }
        break;
    }
  }

  /** 打开本地资源管理器选择文件添加到引用中 */
  private async openFilePicker(): Promise<void> {
    const self = this;
    // 创建隐藏的 file input 触发 OS 文件选择对话框
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".md,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.csv";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        document.body.removeChild(input);
        return;
      }

      const mdFiles = self.app.vault.getMarkdownFiles();
      const allVaultFiles = self.app.vault.getFiles();

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const fileName = file.name;
        const ext = fileName.split(".").pop()?.toLowerCase() || "";

        if (ext === "md") {
          // .md 文件 — 尝试在 vault 中匹配
          const basename = fileName.replace(/\.md$/, "");
          const match = mdFiles.find(
            (f) => f.basename === basename || f.basename.toLowerCase() === basename.toLowerCase()
          );
          if (match) {
            if (!self.noteReferences.find((r) => r.path === match.path)) {
              self.noteReferences.push({ path: match.path, name: match.basename });
            }
          } else {
            // vault 中没有匹配，直接使用文件名
            if (!self.attachedFiles.includes(fileName)) {
              self.attachedFiles.push(fileName);
            }
          }
        } else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
          // 图片文件 — 通过虚拟路径引用
          if (!self.attachedFiles.includes(fileName)) {
            self.attachedFiles.push(fileName);
          }
        } else {
          // 其他文件类型
          if (!self.attachedFiles.includes(fileName)) {
            self.attachedFiles.push(fileName);
          }
        }
      }

      document.body.removeChild(input);
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
    });

    input.click();
  }

  // ==================== 内联 Chip 系统（contentEditable） ====================

  /** 获取输入框纯文本（Chip 用标记替换） */
  private getInputPlainText(): string {
    if (!this.inputEl) return "";
    let text = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      } else if (node instanceof HTMLElement && node.classList.contains("llm-chat-inline-chip")) {
        text += node.getAttribute("data-chip-ref") || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const child of node.childNodes) {
          walk(child);
        }
        if (node instanceof HTMLDivElement || node instanceof HTMLParagraphElement) {
          text += "\n";
        }
      }
    };
    for (const child of this.inputEl.childNodes) {
      walk(child);
    }
    return text.trim();
  }

  /** 检查输入框是否为空 */
  private isInputEmpty(): boolean {
    const text = this.getInputPlainText();
    if (text) return false;
    // 也检查是否有非空 chip
    const chips = this.inputEl?.querySelectorAll(".llm-chat-inline-chip");
    return !chips || chips.length === 0;
  }

  /** 清空输入框 */
  private clearInlineInput(): void {
    if (!this.inputEl) return;
    this.inputEl.empty();
    this.inlineChipMap.clear();
    this.autoResizeInput();
  }

  /** 创建 Chip DOM 元素 */
  private createChipElement(chipId: string, type: string, name: string, pathOrUrl?: string): HTMLSpanElement {
    const chip = document.createElement("span");
    chip.className = `llm-chat-inline-chip llm-chat-inline-chip-${type}`;
    chip.setAttr("contenteditable", "false");
    chip.setAttr("data-chip-id", chipId);
    chip.setAttr("data-chip-type", type);
    chip.setAttr("data-chip-ref", `@${name}`);
    if (pathOrUrl) {
      chip.setAttr("data-chip-path", pathOrUrl);
      // note/folder 类型 Chip：悬停显示完整路径
      if (type === "note" || type === "folder") {
        chip.setAttr("title", pathOrUrl);
      }
    }

    let icon = "";
    if (type === "note") icon = Icons.doc(12);
    else if (type === "folder") icon = Icons.folder(12);
    else if (type === "url") icon = Icons.link(12);
    else if (type === "file") icon = Icons.paperclip(12);
    else if (type === "selection") icon = Icons.selectionRef(12);
    else if (type === "image") icon = Icons.image(12);

    chip.innerHTML = `${icon}<span class="llm-chat-inline-chip-text">${name}</span><span class="llm-chat-inline-chip-x">${Icons.x(10)}</span>`;

    chip.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".llm-chat-inline-chip-x")) {
        this.removeInlineChip(chipId);
      }
    });

    // 图片 Chip：鼠标悬停显示缩略图
    if (type === "image" && pathOrUrl) {
      this.bindImageChipPreview(chip, pathOrUrl);
    }

    return chip;
  }

  /** 为图片 Chip 绑定悬停缩略图预览 */
  private bindImageChipPreview(chip: HTMLSpanElement, imagePath: string): void {
    let previewEl: HTMLDivElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPreview = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (previewEl) {
        previewEl.remove();
        previewEl = null;
      }
    };

    const showPreview = async () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (previewEl) return;

      try {
        const file = this.app.vault.getAbstractFileByPath(imagePath);
        if (!file || !(file instanceof TFile)) return;
        const resourcePath = this.app.vault.getResourcePath(file);

        previewEl = document.createElement("div");
        previewEl.className = "llm-chat-image-preview";
        previewEl.innerHTML = `<img src="${resourcePath}" alt="${imagePath}" />`;
        document.body.appendChild(previewEl);

        // 鼠标进入 preview 时保持显示，离开时隐藏
        previewEl.addEventListener("mouseenter", () => {
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        });
        previewEl.addEventListener("mouseleave", () => {
          hidePreview();
        });

        // 定位到 Chip 上方
        const chipRect = chip.getBoundingClientRect();
        const previewW = 200;
        let left = chipRect.left + chipRect.width / 2 - previewW / 2;
        if (left < 8) left = 8;
        if (left + previewW > window.innerWidth - 8) left = window.innerWidth - previewW - 8;
        previewEl.style.left = `${left}px`;
        previewEl.style.top = `${chipRect.top - 8}px`;

        // 淡入动画
        requestAnimationFrame(() => {
          if (previewEl) previewEl.addClass("llm-chat-image-preview-visible");
        });
      } catch {
        // 图片读取失败，静默忽略
      }
    };

    const hidePreview = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      hideTimer = setTimeout(() => {
        if (previewEl) {
          previewEl.removeClass("llm-chat-image-preview-visible");
          setTimeout(() => {
            previewEl?.remove();
            previewEl = null;
          }, 150);
        }
      }, 100);
    };

    chip.addEventListener("mouseenter", showPreview);
    chip.addEventListener("mouseleave", hidePreview);

    // 注册清理回调：Chip 被删除时立即移除缩略图
    (chip as any).__llmChatClearImagePreview = clearPreview;
  }

  /** 在光标位置插入内联 Chip */
  private insertInlineChip(type: string, name: string, extra?: { path?: string; url?: string; text?: string }): void {
    if (!this.inputEl) return;
    const chipId = this.generateId();

    // 将 chip 数据存入 map
    this.inlineChipMap.set(chipId, {
      type: type as InlineChipData["type"],
      name,
      path: extra?.path,
      url: extra?.url,
      text: extra?.text,
    });

    const chip = this.createChipElement(chipId, type, name, extra?.path || extra?.url);

    // 聚焦输入框
    this.inputEl.focus();
    const sel = window.getSelection();
    if (!sel) return;

    // 恢复保存的光标位置（关键！防止 focus() 把光标放到开头）
    if (this.savedCursorRange) {
      sel.removeAllRanges();
      sel.addRange(this.savedCursorRange);
      this.savedCursorRange = null;
    }

    // 处理 @ 符号（删除 @ 及搜索文本，并把光标放在该位置）
    this.resolvePendingAtSign();

    // 在光标处插入 chip
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(chip);

    // 在 chip 后面插入一个空格，光标放在空格后
    const space = document.createTextNode(" ");
    range.setStartAfter(chip);
    range.collapse(true);
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    this.autoResizeInput();
  }

  /** 删除内联 Chip */
  private removeInlineChip(chipId: string): void {
    const chip = this.inputEl?.querySelector(`[data-chip-id="${chipId}"]`);
    if (chip) {
      (chip as any).__llmChatClearImagePreview?.();
      chip.remove();
    }
    this.inlineChipMap.delete(chipId);
    this.autoResizeInput();
    this.inputEl?.focus();
  }

  /** Backspace 时处理 Chip 删除 */
  private handleChipBackspace(): void {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;

    // 如果光标在文本节点开头，检查前一个兄弟是否是 chip
    if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
      const prev = node.previousSibling;
      if (prev instanceof HTMLElement && prev.classList.contains("llm-chat-inline-chip")) {
        const chipId = prev.getAttribute("data-chip-id");
        if (chipId) {
          prev.remove();
          this.inlineChipMap.delete(chipId);
          this.autoResizeInput();
        }
        return;
      }
    }

    // 如果光标直接在 chip 后面（range.startContainer 就是 chip 后面的节点）
    if (node.nodeType === Node.ELEMENT_NODE) {
      const children = Array.from(node.childNodes);
      const idx = children.indexOf(range.startContainer === node ? range.startContainer.childNodes[range.startOffset] as ChildNode : null as any);
      // simplify: check if selected node is right after a chip
      const allChips = this.inputEl?.querySelectorAll(".llm-chat-inline-chip");
      // alternative approach: check if cursor is immediately after chip
    }
  }

  /** 检查是否触发了 @ 引用 */
  private checkAtTrigger(): void {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType === Node.TEXT_NODE && offset > 0) {
      const text = node.textContent || "";
      if (text.charAt(offset - 1) === "@") {
        const beforeAt = text.charAt(offset - 2);
        if (beforeAt === "" || beforeAt === " " || beforeAt === "\n") {
          // 保存 @ 符号位置，供后续 Chip 插入时删除 @ 及搜索文本
          this.pendingAtNode = node as Text;
          this.pendingAtOffset = offset - 1;
          this.openAtReferenceMenu();
        }
      }
    }
  }

  /** 删除输入框中 pending 的 @ 符号及之后的搜索文本 */
  private resolvePendingAtSign(): void {
    if (!this.pendingAtNode || this.pendingAtOffset < 0 || !this.inputEl) {
      this.pendingAtNode = null;
      this.pendingAtOffset = -1;
      return;
    }

    const node = this.pendingAtNode;
    const atOffset = this.pendingAtOffset;

    // 清除 pending 状态（避免重复调用）
    this.pendingAtNode = null;
    this.pendingAtOffset = -1;

    // 验证文本节点是否仍在 inputEl 中
    if (!this.inputEl.contains(node)) return;
    const nodeText = node.textContent || "";
    if (atOffset >= nodeText.length) return;

    // 从 @ 位置删除到该文本节点末尾
    const range = document.createRange();
    range.setStart(node, atOffset);
    range.setEnd(node, nodeText.length);
    range.deleteContents();

    // 将光标放在原 @ 位置
    const sel = window.getSelection();
    if (!sel) return;
    const newRange = document.createRange();
    newRange.setStart(node, atOffset);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  /** 在光标处插入文本 */
  private insertTextAtCursor(text: string): void {
    if (!this.inputEl) return;
    this.inputEl.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    this.autoResizeInput();
  }

  // ==================== 旧输入框自适应高度 ====================

  private autoResizeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.style.height = "auto";
    const maxH = window.innerHeight * 0.5;
    const scrollH = this.inputEl.scrollHeight;
    this.inputEl.style.height = Math.min(scrollH, maxH) + "px";
  }

  // ==================== 上下文进度条 ====================

  private updateContextBar(): void {
    // 更新模型名称标签
    const modelLabel = this.bottomBar.querySelector(".llm-chat-toolbar-model-name");
    if (modelLabel) modelLabel.setText(this.getCurrentModel());

    const tab = this.getActiveTab();
    const totalChars = tab
      ? tab.handler.getMessages().reduce((sum, m) => sum + (m.content || "").length, 0)
      : 0;
    const estTokens = Math.ceil(totalChars / 4);

    let maxTokens: number;
    if (this.settings.enable1MContext) {
      maxTokens = 1048576; // 1M tokens
    } else {
      const model = this.getCurrentModel();
      maxTokens = CTX_WINDOWS[model] || CTX_WINDOWS[model.toLowerCase()] || 65536;
    }
    const pct = Math.min(100, Math.round((estTokens / maxTokens) * 100));

    // 输入区底部进度条
    if (this.contextFillEl) {
      this.contextFillEl.style.width = `${pct}%`;
      if (pct > 80) {
        this.contextFillEl.classList.add("high");
        this.contextFillEl.classList.remove("medium");
      } else if (pct > 50) {
        this.contextFillEl.classList.add("medium");
        this.contextFillEl.classList.remove("high");
      } else {
        this.contextFillEl.classList.remove("medium", "high");
      }
    }

    // 工具栏内模型选择框下方进度条（仅进度条，无文字）
    if (this.toolbarContextFillEl) {
      this.toolbarContextFillEl.style.width = `${pct}%`;
      if (pct > 80) {
        this.toolbarContextFillEl.classList.add("high");
        this.toolbarContextFillEl.classList.remove("medium");
      } else if (pct > 50) {
        this.toolbarContextFillEl.classList.add("medium");
        this.toolbarContextFillEl.classList.remove("high");
      } else {
        this.toolbarContextFillEl.classList.remove("medium", "high");
      }
    }

    // 输入框下方上下文占用条（绿色胶囊 + 白色进度 + 白色文字）
    if (this.inputContextFillEl) {
      this.inputContextFillEl.style.width = `${pct}%`;
    }
    if (this.inputContextTextEl) {
      const maxTokensText = maxTokens > 9999 ? `${Math.round(maxTokens / 1000)}K` : String(maxTokens);
      this.inputContextTextEl.setText(`${estTokens}/${maxTokensText}${this.str("contextOccupied")}`);
    }

    if (this.contextLabelEl) {
      this.contextLabelEl.setText(`${this.str("contextUsage")} ${estTokens} / ${maxTokens > 1000 ? Math.round(maxTokens / 1000) + "K" : maxTokens} (${pct}%)`);
    }
  }

  // ==================== 当前模型上下文窗口 ====================

  private getContextEstimate(): number {
    const tab = this.getActiveTab();
    if (!tab) return 0;
    const totalChars = tab.handler.getMessages().reduce((sum, m) => sum + (m.content || "").length, 0);
    return Math.ceil(totalChars / 4);
  }

  // ==================== 历史对话 ====================

  private toggleHistoryPanel(): void {
    const existing = this.containerEl.querySelector(".llm-chat-history-panel");
    if (existing) { 
      existing.remove(); 
      this.restoreMessageContent();
      return; 
    }
    this.closeSettingsPanel();
    this.showHistoryPanel();
  }

  private async showHistoryPanel(): Promise<void> {
    const panel = this.chatContainer.createDiv("llm-chat-history-panel");
    const header = panel.createDiv("llm-chat-history-header");
    header.createSpan({ text: this.str("historyTitle") });
    const closeBtn = header.createSpan({ cls: "llm-chat-history-close", text: "✕" });
    closeBtn.addEventListener("click", () => panel.remove());

    // 搜索框（带右侧图标）
    const searchWrap = panel.createDiv("llm-chat-history-search-wrap");
    const searchInput = searchWrap.createEl("input", {
      cls: "llm-chat-history-search",
      attr: { placeholder: this.str("historySearch"), type: "text" },
    });
    const searchIcon = searchWrap.createSpan("llm-chat-history-search-icon");
    searchIcon.innerHTML = Icons.pixsoSearch(18);

    const list = panel.createDiv("llm-chat-history-list");
    const records = await this.loadHistory();
    this.cleanOldHistory(records);
    records.sort((a, b) => b.updatedAt - a.updatedAt);

    const renderHistory = (query: string) => {
      const filtered = query
        ? records.filter((r) => {
            const q = query.toLowerCase();
            if (r.title.toLowerCase().includes(q)) return true;
            return r.messages.some((m) => {
              if (m.role === "system" || m.role === "tool") return false;
              return (m.content || "").toLowerCase().includes(q);
            });
          })
        : records;

      list.empty();

      if (filtered.length === 0) {
        list.createDiv({ cls: "llm-chat-history-empty", text: this.str("historyEmpty") });
        return;
      }

      // 按日期分组
      const groups = this.groupByDate(filtered);
      for (const [groupLabel, groupRecords] of Object.entries(groups)) {
        list.createDiv({ cls: "llm-chat-history-date-group", text: groupLabel });
        for (const record of groupRecords) {
          const item = list.createDiv("llm-chat-history-item");

          // 前置对话图标
          const iconEl = item.createSpan("llm-chat-history-item-icon");
          iconEl.innerHTML = Icons.chat(18);

          const info = item.createDiv("llm-chat-history-item-info");
          const titleEl = info.createDiv({ cls: "llm-chat-history-item-title", text: record.title });
          titleEl.setAttr("data-record-id", record.id);
          titleEl.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.editHistoryTitleInline(titleEl, record, list);
          });
          info.createDiv({ cls: "llm-chat-history-item-date", text: new Date(record.updatedAt).toLocaleString() });

          // 搜索时显示匹配预览
          if (query && !record.title.toLowerCase().includes(query.toLowerCase())) {
            const matchedMsg = record.messages.find((m) => {
              if (m.role === "system" || m.role === "tool") return false;
              return (m.content || "").toLowerCase().includes(query.toLowerCase());
            });
            if (matchedMsg) {
              const preview = (matchedMsg.content || "").substring(0, 80);
              info.createDiv({ cls: "llm-chat-history-match", text: preview + "..." });
            }
          }

          const actions = item.createDiv("llm-chat-history-item-actions");

          // Loading：加载/刷新对话
          const loadBtn = actions.createEl("button", {
            cls: "llm-chat-history-action-btn llm-chat-history-load-btn",
          });
          loadBtn.innerHTML = Icons.assetLoading(16);
          loadBtn.addEventListener("click", () => {
            this.loadConversation(record, query || undefined);
            panel.remove();
          });

          // Edit：重命名
          const editBtn = actions.createEl("button", {
            cls: "llm-chat-history-action-btn llm-chat-history-edit-btn",
          });
          editBtn.innerHTML = Icons.assetEdit(16);
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.editHistoryTitleInline(titleEl, record, list);
          });

          // Delete：删除
          const delBtn = actions.createEl("button", {
            cls: "llm-chat-history-action-btn llm-chat-history-del-btn",
          });
          delBtn.innerHTML = Icons.assetDelete(16);
          delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await this.deleteHistoryRecord(record.id);
            // 从闭包快照中同步移除，点击后立即从列表消失（无需刷新面板）
            const idx = records.findIndex((r) => r.id === record.id);
            if (idx >= 0) records.splice(idx, 1);
            renderHistory(searchInput.value);
          });
        }
      }
    };

    searchInput.addEventListener("input", () => renderHistory(searchInput.value));
    renderHistory("");
    // 自动聚焦搜索框
    setTimeout(() => searchInput.focus(), 50);
  }

  /** 按日期对记录分组 */
  private groupByDate(records: ConversationRecord[]): Record<string, ConversationRecord[]> {
    const groups: Record<string, ConversationRecord[]> = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    for (const r of records) {
      const d = new Date(r.updatedAt);
      let key: string;
      if (d >= today) {
        key = this.str("historyDateToday");
      } else if (d >= yesterday) {
        key = this.str("historyDateYesterday");
      } else if (d >= weekAgo) {
        key = this.str("historyDateThisWeek");
      } else {
        key = this.str("historyDateEarlier");
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }

  private async loadHistory(): Promise<ConversationRecord[]> {
    const s = await this.onLoadSettings();
    const raw = (s as unknown as Record<string, unknown>)[HISTORY_KEY];
    return Array.isArray(raw) ? (raw as ConversationRecord[]) : [];
  }

  private async saveHistory(records: ConversationRecord[]): Promise<void> {
    const s = await this.onLoadSettings();
    (s as unknown as Record<string, unknown>)[HISTORY_KEY] = records;
    await this.onSaveSettings(s);
  }

  // ==================== 设置面板 ====================

  private toggleSettingsPanel(): void {
    const existing = this.chatContainer.querySelector(".llm-chat-settings-panel");
    if (existing) { 
      existing.remove(); 
      this.restoreMessageContent();
      return; 
    }
    this.closeHistoryPanel();
    this.showSettingsPanel();
  }

  private showSettingsPanel(): void {
    this.hideMessageContent();

    const panel = this.chatContainer.createDiv("llm-chat-settings-panel");
    const header = panel.createDiv("llm-chat-settings-panel-header");
    header.createSpan({ text: this.str("settingsTitle") });
    const closeBtn = header.createSpan({ cls: "llm-chat-settings-panel-close", text: "✕" });
    closeBtn.addEventListener("click", () => {
      panel.remove();
      this.restoreMessageContent();
    });

    const content = panel.createDiv("llm-chat-settings-panel-content");

    if (!this.settingsRenderer) {
      this.settingsRenderer = new SettingsRenderer(
        this.app,
        this.settings,
        () => {
          this.onLoadSettings().then(async (s) => {
            this.settings = s;
            await this.updateSettings(s);
          });
        },
        async () => {
          await this.onSaveSettings(this.settings);
        },
        "",
        undefined,
        this.sedimentManager || undefined
      );
    }

    this.settingsRenderer.render(content);
  }

  private hideMessageContent(): void {
    this.chatContainer.querySelectorAll(".llm-chat-tab-content").forEach(el => {
      (el as HTMLElement).style.display = "none";
    });
  }

  private restoreMessageContent(): void {
    for (const tab of this.tabs) {
      if (tab.id === this.activeTabId) {
        tab.containerEl.style.display = "";
      } else {
        tab.containerEl.style.display = "none";
      }
    }
}

  private closeSettingsPanel(): void {
    const panel = this.chatContainer.querySelector(".llm-chat-settings-panel");
    if (panel) {
      panel.remove();
      this.restoreMessageContent();
    }
  }

  private closeHistoryPanel(): void {
    const panel = this.chatContainer.querySelector(".llm-chat-history-panel");
    if (panel) {
      panel.remove();
      this.restoreMessageContent();
    }
  }

  private cleanOldHistory(records: ConversationRecord[]): void {
    const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const valid = records.filter((r) => r.updatedAt >= cutoff);
    if (valid.length !== records.length) this.saveHistory(valid);
  }

  private async saveTabToHistory(tab: ChatTab): Promise<void> {
    const msgs = tab.handler.getMessages();
    const nonSystem = msgs.filter((m) => m.role !== "system");
    if (nonSystem.length === 0) return;
    const firstUser = nonSystem.find((m) => m.role === "user");
    const autoTitle = firstUser ? (firstUser.content || "").substring(0, 40) : this.str("defaultTabTitle");
    const records = await this.loadHistory();
    const existingIdx = records.findIndex((r) => r.id === tab.id);
    const keepTitle = existingIdx >= 0 && records[existingIdx].customTitle ? records[existingIdx].title : autoTitle;
    const record: ConversationRecord = {
      id: tab.id, title: keepTitle, messages: msgs,
      createdAt: existingIdx >= 0 ? records[existingIdx].createdAt : Date.now(),
      updatedAt: Date.now(),
      customTitle: existingIdx >= 0 ? records[existingIdx].customTitle : false,
      personaId: tab.personaId,
    };
    if (existingIdx >= 0) records[existingIdx] = record;
    else records.push(record);
    await this.saveHistory(records);
  }

  private async saveCurrentConversations(): Promise<void> {
    for (const tab of this.tabs) await this.saveTabToHistory(tab);
  }

  private loadConversation(record: ConversationRecord, searchQuery?: string): void {
    this.addTab(true, record.id, record.title, record.personaId ?? null);
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.handler.loadMessages(record.messages);
    if (record.personaId) {
      const prompt = resolvePersonaPrompt(record.personaId, this.settings);
      if (prompt != null) tab.handler.setCustomSystemPrompt(prompt);
    }
    tab.title = record.title;
    tab.isDefaultTitle = false;
    tab.containerEl.empty();
    let msgIndex = 0;
    let scrollTarget: HTMLElement | null = null;
    for (const msg of tab.handler.getMessages()) {
      if (msg.role === "user") this.renderUserMessage(tab, msg.content || "", msg.id);
      else if (msg.role === "assistant" && !msg.tool_calls) this.renderAssistantMessage(tab, msg.content || "", msg.id);
      else { msgIndex++; continue; }
      // 给每条消息设置 data 属性，用于搜索跳转
      const msgs = tab.containerEl.querySelectorAll(".llm-chat-message");
      const lastMsg = msgs[msgs.length - 1] as HTMLElement;
      if (lastMsg) lastMsg.setAttr("data-message-index", String(msgIndex));
      // 搜索跳转：找到第一条匹配查询的消息
      if (searchQuery && !scrollTarget && msg.content && msg.content.toLowerCase().includes(searchQuery.toLowerCase())) {
        scrollTarget = lastMsg;
      }
      msgIndex++;
    }
    this.updateContextBar();
    // 滚动到匹配消息
    if (scrollTarget) {
      setTimeout(() => {
        scrollTarget!.scrollIntoView({ behavior: "smooth", block: "center" });
        scrollTarget!.style.background = "var(--background-modifier-hover)";
        setTimeout(() => { scrollTarget!.style.background = ""; }, 2000);
      }, 100);
    }
  }

  private async deleteHistoryRecord(id: string): Promise<void> {
    const records = await this.loadHistory();
    await this.saveHistory(records.filter((r) => r.id !== id));
  }

  // ==================== 消息渲染 ====================

  /** 带图标的头部 */
  private createHeader(bubble: HTMLElement, iconSvg: string, text: string): HTMLElement {
    const header = bubble.createDiv("llm-chat-header");
    const iconEl = header.createSpan("llm-chat-header-icon");
    iconEl.innerHTML = iconSvg;
    header.createSpan({ text });
    return header;
  }

  private addWelcomeMessage(tab: ChatTab): void {
    const msgEl = tab.containerEl.createDiv("llm-chat-message assistant llm-chat-welcome");
    const bubble = msgEl.createDiv("llm-chat-bubble");
    this.createHeader(bubble, Icons.assistant(14), this.str("welcomeHeader"));
    const body = bubble.createDiv("llm-chat-body");
    body.innerHTML = this.str("welcomeBody");
  }

  private addUserMessage(tabId: string, content: string): void {
    const tab = this.getTab(tabId);
    if (!tab) return;
    const _u = [...tab.handler.getMessages()].reverse().find((m) => m.role === "user");
    this.renderUserMessage(tab, content, _u?.id);
    tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
    this.updateContextBar();
  }

  private renderUserMessage(tab: ChatTab, content: string, msgId?: string): void {
    const msgEl = tab.containerEl.createDiv("llm-chat-message user");
    if (msgId) msgEl.setAttr("data-msg-id", msgId);
    const bubble = msgEl.createDiv("llm-chat-bubble");
    this.createHeader(bubble, Icons.user(14), this.str("userHeader"));
    const body = bubble.createDiv("llm-chat-body");
    body.setText(content);
    this.addUserActionButtons(msgEl, tab);
    this.addMsgNavNode(msgEl);
  }

  // ==================== 消息导航条 ====================

  /** 根据当前活动标签重建消息导航节点 */
  private rebuildMsgNav(): void {
    if (!this.msgNavEl) return;
    this.msgNavEl.empty();
    this.msgNavNodes = [];
    const tab = this.getActiveTab();
    if (!tab) return;
    const userMsgs = tab.containerEl.querySelectorAll(".llm-chat-message.user");
    userMsgs.forEach((msgEl) => this.addMsgNavNode(msgEl as HTMLElement));
    this.bindMsgNavScroll();
  }

  /** 为一条用户消息添加导航节点 */
  private addMsgNavNode(msgEl: HTMLElement): void {
    if (!this.msgNavEl) return;
    const navEl = this.msgNavEl.createDiv("llm-chat-msg-nav-node");
    navEl.setAttr("title", "跳转到该条消息");
    navEl.addEventListener("click", () => {
      msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    this.msgNavNodes.push({ msgEl, navEl });
  }

  /** 根据滚动位置高亮当前可见的消息节点 */
  private updateMsgNavHighlight(): void {
    if (!this.msgNavNodes.length) return;
    const tab = this.getActiveTab();
    if (!tab) return;
    const top = tab.containerEl.scrollTop;
    const height = tab.containerEl.clientHeight;
    let activeIdx = 0;
    this.msgNavNodes.forEach((node) => {
      const rectTop = node.msgEl.offsetTop;
      if (rectTop <= top + height * 0.5) activeIdx = this.msgNavNodes.indexOf(node);
    });
    this.msgNavNodes.forEach((node, i) => {
      if (i === activeIdx) node.navEl.addClass("active");
      else node.navEl.removeClass("active");
    });
  }

  /** 绑定容器滚动事件以更新高亮 */
  private bindMsgNavScroll(): void {
    const tab = this.getActiveTab();
    if (!tab || this.msgNavBoundContainers.has(tab.containerEl)) return;
    this.msgNavBoundContainers.add(tab.containerEl);
    tab.containerEl.addEventListener("scroll", () => this.updateMsgNavHighlight());
  }

  private updateStreamingMessage(tabId: string, content: string): void {
    const tab = this.getTab(tabId);
    if (!tab) return;
    if (!tab.currentAssistantMsg || !tab.isStreaming) {
      tab.isStreaming = true;
      tab.currentAssistantMsg = tab.containerEl.createDiv("llm-chat-message assistant streaming");
      const bubble = tab.currentAssistantMsg.createDiv("llm-chat-bubble");
      this.createHeader(bubble, Icons.assistant(14), this.str("assistantStreamingHeader"));
      const body = bubble.createDiv("llm-chat-body");
      body.setText(content);
    } else {
      const body = tab.currentAssistantMsg.querySelector(".llm-chat-body");
      if (body) body.setText(content);
    }
    if (tab.autoScroll) {
      tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
    }
  }

  private finalizeStreamingMessage(tabId: string, content: string): void {
    const tab = this.getTab(tabId);
    if (!tab || !tab.currentAssistantMsg) return;
    const _a = [...tab.handler.getMessages()].reverse().find((m) => m.role === "assistant");
    if (_a?.id) tab.currentAssistantMsg.setAttr("data-msg-id", _a.id);
    tab.currentAssistantMsg.removeClass("streaming");
    const headerIcon = tab.currentAssistantMsg.querySelector(".llm-chat-header-icon");
    if (headerIcon) {
      const headerText = headerIcon.nextElementSibling;
      if (headerText) (headerText as HTMLElement).textContent = this.str("assistantHeader");
    }
    const body = tab.currentAssistantMsg.querySelector(".llm-chat-body");
    if (body && content) {
      body.empty();
      MarkdownRenderer.renderMarkdown(content, body as HTMLElement, "", new Component());
    }
    // 添加操作按钮
    this.addAssistantActionButtons(tab.currentAssistantMsg, tab, false);
    tab.currentAssistantMsg = null;
    tab.isStreaming = false;
    this.updateContextBar();
  }

  private renderAssistantMessage(tab: ChatTab, content: string, msgId?: string): void {
    const msgEl = tab.containerEl.createDiv("llm-chat-message assistant");
    if (msgId) msgEl.setAttr("data-msg-id", msgId);
    const bubble = msgEl.createDiv("llm-chat-bubble");
    this.createHeader(bubble, Icons.assistant(14), this.str("assistantHeader"));
    const body = bubble.createDiv("llm-chat-body");
    MarkdownRenderer.renderMarkdown(content, body, "", new Component());
    this.addAssistantActionButtons(msgEl, tab, false);
  }

  private addToolCallBubble(tabId: string, name: string, args: Record<string, unknown>): void {
    const tab = this.getTab(tabId);
    if (!tab) return;
    this.renderToolCall(tab, name, args);
    tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
  }

  private renderToolCall(tab: ChatTab, name: string, args: Record<string, unknown>): void {
    const msgEl = tab.containerEl.createDiv("llm-chat-message tool-call collapsed");
    const bubble = msgEl.createDiv("llm-chat-bubble");
    const header = this.createHeader(bubble, Icons.wrench(14), `${this.str("toolCallPrefix")} ${name}`);
    // 添加展开箭头
    const arrow = header.createSpan("llm-chat-collapse-arrow");
    arrow.innerHTML = Icons.chevronRight(12);
    const body = bubble.createDiv("llm-chat-body");
    body.createEl("pre", { text: JSON.stringify(args, null, 2) });
    // 默认隐藏 body
    body.hide();
    // 点击 header 或 bubble 切换折叠
    const toggle = () => {
      if (msgEl.hasClass("collapsed")) {
        msgEl.removeClass("collapsed");
        body.show();
        arrow.innerHTML = Icons.chevronDown(12);
      } else {
        msgEl.addClass("collapsed");
        body.hide();
        arrow.innerHTML = Icons.chevronRight(12);
      }
    };
    header.style.cursor = "pointer";
    header.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".llm-chat-action-btn")) return;
      toggle();
    });
    bubble.style.cursor = "pointer";
    bubble.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".llm-chat-action-btn") || target.closest(".llm-chat-header")) return;
      toggle();
    });
  }

  private addToolResultBubble(tabId: string, name: string, result: string): void {
    const tab = this.getTab(tabId);
    if (!tab) return;
    this.renderToolResult(tab, name, result);
    tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
  }

  private renderToolResult(tab: ChatTab, name: string, result: string): void {
    const msgEl = tab.containerEl.createDiv("llm-chat-message tool-result collapsed");
    const bubble = msgEl.createDiv("llm-chat-bubble");
    const headerText = this.str("toolResultSuffix")
      ? `${this.str("toolResultPrefix")} ${name} ${this.str("toolResultSuffix")}`
      : `${this.str("toolResultPrefix")} ${name}`;
    const header = this.createHeader(bubble, Icons.doc(14), headerText);
    const arrow = header.createSpan("llm-chat-collapse-arrow");
    arrow.innerHTML = Icons.chevronRight(12);
    const body = bubble.createDiv("llm-chat-body");
    body.createEl("pre", { text: result });
    body.hide();
    const toggle = () => {
      if (msgEl.hasClass("collapsed")) {
        msgEl.removeClass("collapsed");
        body.show();
        arrow.innerHTML = Icons.chevronDown(12);
      } else {
        msgEl.addClass("collapsed");
        body.hide();
        arrow.innerHTML = Icons.chevronRight(12);
      }
    };
    header.style.cursor = "pointer";
    header.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".llm-chat-action-btn")) return;
      toggle();
    });
    bubble.style.cursor = "pointer";
    bubble.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".llm-chat-action-btn") || target.closest(".llm-chat-header")) return;
      toggle();
    });
  }

  private addErrorBubble(tabId: string, message: string): void {
    const tab = this.getTab(tabId);
    if (!tab) return;
    const msgEl = tab.containerEl.createDiv("llm-chat-message error");
    const bubble = msgEl.createDiv("llm-chat-bubble");
    this.createHeader(bubble, Icons.alert(14), this.str("errorHeader"));
    const body = bubble.createDiv("llm-chat-body");
    body.setText(message);
    if (tab.currentAssistantMsg) {
      tab.currentAssistantMsg.removeClass("streaming");
      tab.currentAssistantMsg = null;
      tab.isStreaming = false;
    }
    // 错误时重置生成状态
    if (this.generatingTabId === tabId) {
      this.setSendButtonNormalMode();
      this.generatingTabId = null;
    }
    tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
    this.updateContextBar();
  }

  // ==================== 发送与状态 ====================

  private setThinking(thinking: boolean): void {
    this.updateStatusLogo();
    if (thinking) {
      const indicator = this.statusEl.createSpan("llm-chat-thinking-dots");
      indicator.innerHTML = Icons.dots(14);
    }
  }

  private async sendMessage(): Promise<void> {
    const content = this.getInputPlainText();
    if (!content) return;

    const tab = this.getActiveTab();
    if (!tab) return;

    // 构建带引用笔记、文件附件和选中文字的消息
    let fullContent = content;

    // 将内联 @笔记名 引用还原为 [[path]]，让 LLM 理解完整文件路径
    for (const ref of this.noteReferences) {
      fullContent = fullContent.split(`@${ref.name}`).join(`[[${ref.path}]]`);
    }

    // 文件夹引用：还原 @文件夹名 为带完整路径的说明，并明确告知 AI 在工具调用时使用完整路径（注意内联 Chip 标记无斜杠）
    for (const ref of this.folderReferences) {
      const folder = this.app.vault.getAbstractFileByPath(ref.path);
      if (folder) {
        const notes = this.app.vault.getMarkdownFiles()
          .filter((f) => f.path.startsWith(ref.path + "/") || f.path.startsWith(ref.path));
        const noteList = notes.map((n) => `- [[${n.path}]]`).join("\n");
        fullContent = fullContent.split(`@${ref.name}`).join(
          `\n📁 引用的文件夹 "${ref.name}"，完整路径为 "${ref.path}"。\n` +
          `重要：如需对该文件夹执行 create_note / move_note 等操作，必须在 folder 或 destinationPath 参数中使用完整路径 "${ref.path}"，` +
          `禁止使用裸名 "${ref.name}"，也不要在 vault 根目录新建同名文件夹。\n` +
          `该文件夹下的现有笔记：\n${noteList || "（空文件夹）"}\n`
        );
      }
    }

    // 网址引用：追加 URL 信息
    if (this.urlReferences.length > 0) {
      fullContent += "\n\n**引用的网址：**\n";
      for (const ref of this.urlReferences) {
        fullContent += `- [${ref.name}](${ref.url})\n`;
      }
    }

    // 选中文字引用
    if (this.selectionText) {
      const fileInfo = this.selectionFilePath
        ? `（来自 [[${this.selectionFilePath}]]）`
        : "";
      fullContent += "\n\n---\n**选中的笔记内容" + fileInfo + "：**\n" + this.selectionText;
      fullContent += `\n\n> 注意：上述选中的笔记内容来自文件 \`${this.selectionFilePath || "未知文件"}\`，请使用 edit_note 工具修改该文件。`;
    }

    // 笔记引用和附件已通过内联 [[path]] 方式嵌入消息文字中，不再额外追加
    // 仅当有 attachedFiles 且不是内联引用的图片时，才追加文件信息
    if (this.attachedFiles.length > 0) {
      const nonImageFiles = this.attachedFiles.filter(f => {
        const ext = f.split(".").pop()?.toLowerCase() || "";
        return !["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
      });
      if (nonImageFiles.length > 0) {
        fullContent += "\n\n**附加的文件：**\n";
        for (const file of nonImageFiles) {
          const name = file.split("/").pop() || file;
          fullContent += `- ${name} (${file})\n`;
        }
      }
    }

    this.clearInlineInput();
    this.generatingTabId = tab.id;
    this.setSendButtonStopMode();
    this.updateStatusLogo();

    try {
      await tab.handler.sendMessage(fullContent);
      await this.saveCurrentConversations();
    } catch (err) {
      console.error("[Sedimind] sendMessage failed:", err);
      new Notice("发送失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      this.setSendButtonNormalMode();
      this.generatingTabId = null;
      this.updateStatusLogo();
      tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
      this.updateContextBar();
      // 清空引用、附件和选中文字
      this.noteReferences = [];
      this.folderReferences = [];
      this.urlReferences = [];
      this.attachedFiles = [];
      this.selectionText = "";
      this.selectionFilePath = "";
    }
  }

  /** 将发送按钮切换为停止模式 */
  private setSendButtonStopMode(): void {
    this.sendBtn.classList.add("stop-mode");
    this.sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
    this.sendBtn.setAttr("title", this.str("stopGeneration"));
  }

  /** 将停止按钮恢复为发送模式 */
  private setSendButtonNormalMode(): void {
    this.sendBtn.classList.remove("stop-mode");
    this.sendBtn.innerHTML = Icons.pixsoSend(14);
    this.sendBtn.setAttr("title", this.str("sendButton"));
  }

  /** 停止当前 AI 生成 */
  private stopGeneration(): void {
    const tab = this.getTab(this.generatingTabId!);
    if (tab) {
      tab.handler.cancel();
    }
    this.setSendButtonNormalMode();
    this.generatingTabId = null;
    this.updateStatusLogo();
  }


  // ==================== 选中文字引用 ====================

  /** 外部调用：设置选中文字并显示 chip */
  public setSelectionText(text: string, filePath?: string): void {
    this.selectionText = text.trim();
    this.selectionFilePath = filePath || "";
    // 自动填充修改指令提示
    if (this.isInputEmpty()) {
      this.insertTextAtCursor(this.str("editSelection") + ": ");
    }
  }

  /** 将选中文字作为「引用选中文字」Chip 插入到输入框 */
  public addSelectionChip(text: string): void {
    if (!this.inputEl || !text.trim()) return;
    this.inputEl.focus();
    // 将光标放到输入框末尾，确保 Chip 插入位置正确
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(this.inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const trimmed = text.trim();
    const displayName = trimmed.length > 24 ? trimmed.slice(0, 24) + "…" : trimmed;
    this.insertInlineChip("selection", displayName, { text: trimmed });
  }

  /** 从 AI 助手弹窗同步消息到当前标签页 */
  public appendQuickCommandMessage(role: "user" | "assistant", content: string): void {
    // 确保有活动标签页
    if (this.tabs.length === 0) {
      this.addTab(true);
    }
    const tab = this.getActiveTab();
    if (!tab) return;

    // 移除欢迎消息
    const welcome = tab.containerEl.querySelector(".llm-chat-welcome");
    if (welcome) welcome.remove();

    // 追加到 handler 历史并渲染
    tab.handler.appendMessage(role, content);
    const _q = [...tab.handler.getMessages()].reverse().find((m) => m.role === role);
    if (role === "user") {
      this.renderUserMessage(tab, content, _q?.id);
    } else {
      this.renderAssistantMessage(tab, content, _q?.id);
    }

    tab.containerEl.scrollTop = tab.containerEl.scrollHeight;
    this.saveTabToHistory(tab);
    this.updateContextBar();
  }

  /** AI 助手弹窗专用：同步消息到新建的不激活标签页 */
  private _quickCommandTabId: string | null = null;

  public appendQuickCommandMessageSilent(role: "user" | "assistant", content: string): void {
    // 首次调用时创建静默标签页（不激活，不切换）
    if (!this._quickCommandTabId || !this.tabs.find(t => t.id === this._quickCommandTabId)) {
      const id = this.generateId();
      const title = "Quick Command";
      const containerEl = this.chatContainer.createDiv("llm-chat-tab-content");
      containerEl.setAttr("data-tab-id", id);
      containerEl.hide(); // 不显示

      const ui: UICallbacks = {
        onUserMessage: (c) => this.addUserMessage(id, c),
        onAssistantChunk: (c) => this.updateStreamingMessage(id, c),
        onAssistantMessage: (c) => this.finalizeStreamingMessage(id, c),
        onToolCall: (n, a) => this.addToolCallBubble(id, n, a),
        onToolResult: (n, r) => this.addToolResultBubble(id, n, r),
        onError: (m) => this.addErrorBubble(id, m),
        onThinking: (t) => this.setThinking(t),
      };
      const handler = new MessageHandler(this.app, this.settings, ui, undefined, this.mcpManager || undefined, this.memoryManager || undefined, this.sedimentManager || undefined);

      // 创建标签按钮（Pixso 风格数字标签）
      const { tabBtn, numEl, personaBtn } = this.buildTabButton(id, (anchor) => this.showTabPersonaPicker(tab, anchor));
      numEl.setText(String(this.tabs.length + 1));

      const tab: ChatTab = {
        id, title, handler, containerEl,
        currentAssistantMsg: null, isStreaming: false,
        tabBtn, numEl, personaBtnEl: personaBtn,
        isDefaultTitle: false,
        autoScroll: true,
        personaId: null,
      };
      this.tabs.push(tab);
      this._quickCommandTabId = id;
      this.ensureAddTabButton();
      this.renumberTabs();
    }

    const tab = this.tabs.find(t => t.id === this._quickCommandTabId);
    if (!tab) return;

    // 移除欢迎消息（如果有的话）
    const welcome = tab.containerEl.querySelector(".llm-chat-welcome");
    if (welcome) welcome.remove();

    tab.handler.appendMessage(role, content);
    const _q = [...tab.handler.getMessages()].reverse().find((m) => m.role === role);
    if (role === "user") {
      this.renderUserMessage(tab, content, _q?.id);
    } else {
      this.renderAssistantMessage(tab, content, _q?.id);
    }

    this.saveTabToHistory(tab);
    this.updateContextBar();
  }

  /** 捕获当前编辑器中选中的文字 */
  public captureSelection(): void {
    // 遍历所有 markdown leaf 查找选中文字（不仅限当前 active view）
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
      const view = leaf.view as any;
      const editor = view?.editor;
      if (editor && typeof editor.getSelection === "function") {
        const selected = editor.getSelection();
        if (selected && selected.trim().length > 0) {
          const filePath = view?.file?.path || "";
          this.selectionText = selected.trim();
          this.selectionFilePath = filePath;
          // 仅在输入框为空时自动填入提示
          if (this.isInputEmpty()) {
            this.insertTextAtCursor(this.str("editSelection") + ": ");
          }
          return;
        }
      }
    }

    // 兜底：也检查 active view
    const activeView = this.app.workspace.getActiveViewOfType(ItemView);
    if (!activeView) return;
    const editor = (activeView as any).editor;
    if (editor && typeof editor.getSelection === "function") {
      const selected = editor.getSelection();
      if (selected && selected.trim().length > 0) {
        const filePath = (activeView as any)?.file?.path || "";
        this.setSelectionText(selected, filePath);
      }
    }
  }


  // ==================== 模型选择弹窗 ====================

  private async showModelPicker(anchorEl: HTMLElement): Promise<void> {
    // 移除已有弹窗
    const existing = document.querySelector(".llm-chat-model-picker");
    if (existing) { existing.remove(); return; }

    const picker = document.createElement("div");
    picker.className = "llm-chat-model-picker";
    const options = await this.getModelOptions();

    for (const opt of options) {
      const item = picker.createDiv("llm-chat-model-picker-item");
      item.setText(opt.label);
      item.addEventListener("click", async () => {
        const newSettings = { ...this.settings, provider: opt.provider as LLMChatSettings["provider"] };
        if (opt.provider === "openai") newSettings.openaiModel = opt.model;
        else if (opt.provider === "anthropic") newSettings.anthropicModel = opt.model;
        else if (opt.provider === "deepseek") newSettings.deepseekModel = opt.model;
        else if (opt.provider === "ollama") newSettings.ollamaModel = opt.model;
        else if (opt.provider === "claude-code") newSettings.claudeCodeModel = opt.model;
        else if (opt.provider === "codex") newSettings.codexModel = opt.model;
        this.settings = newSettings;
        for (const tab of this.tabs) tab.handler.updateSettings(newSettings);
        this.updateStatusLogo();
        this.updateContextBar();
        await this.onSaveSettings(newSettings);
        picker.remove();
      });
      // 当前选中项高亮
      if (opt.provider === this.settings.provider && opt.model === this.getCurrentModel()) {
        item.addClass("selected");
      }
    }

    // 点击外部关闭
    const close = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);

    // 将弹窗挂载到 body，定位在按钮下方
    document.body.appendChild(picker);
    const rect = anchorEl.getBoundingClientRect();
    picker.style.position = "fixed";
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.top - 4}px`;
    picker.style.transform = "translateY(-100%)";
  }

  // ==================== 粘贴图片 ====================


  private initPasteImage(container: HTMLElement): void {
    container.addEventListener("paste", async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          e.stopPropagation();

          const blob = item.getAsFile();
          if (!blob) continue;

          try {
            // 生成文件名
            const ext = item.type.split("/")[1] || "png";
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const fileName = `llm-chat-pasted-${timestamp}.${ext}`;
            const filePath = `attachments/${fileName}`;

            // 读取为 ArrayBuffer 并保存到 vault
            const arrayBuffer = await blob.arrayBuffer();
            // 确保 attachments 文件夹存在
            const attachmentsFolder = this.app.vault.getAbstractFileByPath("attachments");
            if (!attachmentsFolder) {
              await this.app.vault.createFolder("attachments");
            }
            await this.app.vault.createBinary(filePath, arrayBuffer);

            // 在输入框中插入内联图片 Chip（显示文件名，悬停可预览缩略图）
            const displayName = filePath.split("/").pop() || filePath;
            this.insertInlineChip("image", displayName, { path: filePath });

            // 也添加到 attached files（用于 sendMessage 时组装消息）
            if (!this.attachedFiles.includes(filePath)) {
              this.attachedFiles.push(filePath);
            }
          } catch (err) {
            console.error("[Sedimind] 粘贴图片失败:", err);
            new Notice("图片粘贴失败：" + (err instanceof Error ? err.message : String(err)));
          }
        }
      }
    });
  }

  // ==================== 对话区右键菜单 ====================

  private initMessageContextMenu(container: HTMLElement): void {
    const self = this;
    container.addEventListener("contextmenu", (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const messageEl = target.closest(".llm-chat-message") as HTMLElement;
      if (!messageEl) return;

      const selection = window.getSelection();
      let selectedText = "";
      if (selection && selection.rangeCount > 0) {
        selectedText = selection.toString().trim();
      }
      if (!selectedText) {
        const bodyEl = messageEl.querySelector(".llm-chat-body");
        if (bodyEl) selectedText = bodyEl.textContent?.trim() || "";
      }
      if (!selectedText) return;

      e.preventDefault();
      e.stopPropagation();

      const existingMenu = document.querySelector(".llm-chat-context-menu");
      if (existingMenu) existingMenu.remove();

      const menu = document.createElement("div");
      menu.className = "llm-chat-context-menu";
      menu.style.cssText = `
        position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
        z-index: 99999; background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        padding: 4px; min-width: 200px;
      `;

      const createItem = (label: string, iconSvg: string, action: () => void, danger = false) => {
        const item = document.createElement("div");
        item.style.cssText = `
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; font-size: 13px;
          color: ${danger ? "var(--text-error)" : "var(--text-normal)"};
          cursor: pointer; border-radius: 4px; user-select: none;
        `;
        item.innerHTML = `${iconSvg} <span>${label}</span>`;
        item.addEventListener("mouseenter", () => {
          item.style.background = danger ? "var(--background-modifier-error)" : "var(--background-modifier-hover)";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "";
        });
        item.addEventListener("click", () => {
          menu.remove();
          action();
        });
        return item;
      };

      // 1. AI 助手（用选中文字打开弹窗）
      menu.appendChild(createItem(self.str("cmdAiAssistant"), Icons.assistant(14), () => {
        self.openAiAssistantWithText(selectedText);
      }));

      // 2. 复制选中文字
      menu.appendChild(createItem(self.str("copyMessage"), Icons.copy(14), async () => {
        await navigator.clipboard.writeText(selectedText);
        new Notice(self.str("copiedMessage"));
      }));

      // 3. 引用到输入框
      menu.appendChild(createItem(self.str("selectionRefText"), Icons.search(14), () => {
        const ed = self.inputEl as unknown as HTMLTextAreaElement;
        const cursorPos = ed.selectionStart || ed.value.length;
        const before = ed.value.substring(0, cursorPos);
        const after = ed.value.substring(cursorPos);
        ed.value = before + selectedText + after;
        const newPos = cursorPos + selectedText.length;
        ed.setSelectionRange(newPos, newPos);
        ed.focus();
      }));

      // 4. 分隔线
      const sep = document.createElement("div");
      sep.style.cssText = "height:1px;background:var(--background-modifier-border);margin:4px 8px;";
      menu.appendChild(sep);

      // 5. 搜索选中的文字（在 Obsidian 中搜索）
      menu.appendChild(createItem("搜索:  " + (selectedText.length > 20 ? selectedText.substring(0, 20) + "..." : selectedText), Icons.search(14), () => {
        // 触发 Obsidian 全局搜索
        const searchLeaf = self.app.workspace.getLeavesOfType("search");
        if (searchLeaf.length > 0) {
          self.app.workspace.revealLeaf(searchLeaf[0]);
        }
        // 通过 dispatchEvent 触发搜索
        const ev = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, shiftKey: true, bubbles: true });
        document.querySelector(".workspace")?.dispatchEvent(ev);
        // 备用方案：用 URL 触发
        setTimeout(() => {
          (self.app as any).internalPlugins?.getPluginById("global-search")?.instance?.openGlobalSearch?.(selectedText);
        }, 100);
      }));

      document.body.appendChild(menu);

      // 调整菜单位置，确保不超出窗口边界
      const menuRect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (menuRect.right > vw - 8) {
        menu.style.left = `${Math.max(8, e.clientX - menuRect.width)}px`;
      }
      if (menuRect.bottom > vh - 8) {
        menu.style.top = `${Math.max(8, e.clientY - menuRect.height)}px`;
      }

      const closeMenu = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) {
          menu.remove();
          document.removeEventListener("click", closeMenu);
          document.removeEventListener("contextmenu", closeMenu);
        }
      };
      setTimeout(() => {
        document.addEventListener("click", closeMenu);
        document.addEventListener("contextmenu", closeMenu);
      }, 0);
    });
  }

  /** 从对话区打开 AI 助手弹窗并传入选中的文字 */
  private openAiAssistantWithText(text: string): void {
    // 通过动态导入避免循环依赖
    import("./AiAssistantModal").then(({ AiAssistantModal }) => {
      const modal = new AiAssistantModal(this.app, this.settings, this);
      modal.open();
      setTimeout(() => {
        const inputEl = modal.getInputElement();
        if (inputEl) {
          inputEl.focus();
        }
      }, 150);
    });
  }

  // ==================== 拖拽笔记文件引用 ====================

  private initDragDrop(target: HTMLElement): void {
    let dragCounter = 0;

    target.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
      target.addClass("llm-chat-drag-over");
    });

    target.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        target.removeClass("llm-chat-drag-over");
      }
    });

    target.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
    });

    target.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      target.removeClass("llm-chat-drag-over");

      const dt = e.dataTransfer;
      if (!dt) return;

      // 收集所有可能的路径数据
      const rawPaths: string[] = [];

      // 1. text/plain: Obsidian 主要使用这个格式
      const textData = dt.getData("text/plain");
      if (textData) {
        rawPaths.push(...textData.split(/\r?\n/).map((p) => p.trim()).filter((p) => p.length > 0));
      }

      // 2. text/uri-list: 某些情况下的文件 URI
      const uriData = dt.getData("text/uri-list");
      if (uriData) {
        rawPaths.push(...uriData.split(/\r?\n/).map((p) => p.trim()).filter((p) => p.length > 0));
      }

      // 3. 检查是否有原生文件对象（操作系统拖入文件）
      if (dt.files && dt.files.length > 0) {
        for (let i = 0; i < dt.files.length; i++) {
          const file = dt.files[i];
          if (file.name.endsWith(".md")) {
            rawPaths.push(file.name.replace(/\.md$/, ""));
          } else {
            // 处理图片文件拖入
            const imgExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"];
            const ext = file.name.split(".").pop()?.toLowerCase() || "";
            if (imgExtensions.includes(ext)) {
              e.preventDefault();
              try {
                const arrayBuffer = await file.arrayBuffer();
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                const fileName = `llm-chat-drop-${timestamp}.${ext}`;
                const filePath = `attachments/${fileName}`;
                const attachmentsFolder = this.app.vault.getAbstractFileByPath("attachments");
                if (!attachmentsFolder) {
                  await this.app.vault.createFolder("attachments");
                }
                await this.app.vault.createBinary(filePath, arrayBuffer);
                // 插入图片 Chip
                const displayName = fileName;
                this.insertInlineChip("image", displayName, { path: filePath });
                if (!this.attachedFiles.includes(filePath)) {
                  this.attachedFiles.push(filePath);
                }
              } catch (err) {
                console.error("[Sedimind] 拖入图片失败:", err);
                new Notice("图片拖入失败：" + (err instanceof Error ? err.message : String(err)));
              }
            }
          }
        }
      }

      // 解析路径并插入 Chip（按路径去重，防止 text/plain + dt.files 重复）
      const mdFiles = this.app.vault.getMarkdownFiles();
      const insertedPaths = new Set<string>();

      for (const raw of rawPaths) {
        // 尝试作为笔记路径解析
        const note = this.resolveNotePath(raw, mdFiles);
        if (note) {
          if (insertedPaths.has(note.path)) continue; // 已插入，跳过
          insertedPaths.add(note.path);
          // 插入 note Chip（悬停可看到完整路径）
          this.insertInlineChip("note", note.name, { path: note.path });
          if (!this.noteReferences.find((r) => r.path === note.path)) {
            this.noteReferences.push({ path: note.path, name: note.name });
          }
        } else {
          // 未匹配到笔记，尝试作为文件夹
          const folderPath = this.extractFolderPath(raw);
          const folderName = this.extractFolderName(raw);
          if (folderPath && folderName) {
            // 插入 folder Chip
            this.insertInlineChip("folder", folderName, { path: folderPath });
            if (!this.folderReferences.find((r) => r.path === folderPath)) {
              this.folderReferences.push({ path: folderPath, name: folderName });
            }
          }
        }
      }
    });
  }

  /** 解析拖拽文本为笔记路径 */
  private resolveNotePath(
    raw: string,
    mdFiles: { path: string; basename: string }[]
  ): NoteReference | null {
    // 情况1: obsidian:// URI 格式
    if (raw.startsWith("obsidian://")) {
      try {
        const url = new URL(raw);
        const fileParam = url.searchParams.get("file");
        if (fileParam) {
          const decoded = decodeURIComponent(fileParam);
          return this.findNoteByPath(decoded, mdFiles);
        }
      } catch { /* ignore */ }
    }

    // 情况2: file:// URI 格式
    if (raw.startsWith("file://")) {
      try {
        const url = new URL(raw);
        let filePath = decodeURIComponent(url.pathname);
        // Windows 路径可能以 /C:/ 开头
        filePath = filePath.replace(/^\/[a-zA-Z]:/, (m) => m.substring(1));
        const parts = filePath.replace(/\\/g, "/").split("/");
        const basename = parts[parts.length - 1] || "";
        if (basename.endsWith(".md")) {
          const name = basename.replace(/\.md$/, "");
          const match = mdFiles.find(
            (f) => f.basename === name || f.path.endsWith(filePath.replace(/\\/g, "/"))
          );
          if (match) return { path: match.path, name: match.basename };
          return { path: filePath, name };
        }
        return null;
      } catch { /* ignore */ }
    }

    // 情况3: Wiki 链接 [[Note Name]]
    const wikiMatch = raw.match(/^\[\[(.+?)\]\]$/);
    if (wikiMatch) {
      const name = wikiMatch[1].trim();
      const match = mdFiles.find(
        (f) => f.basename === name || f.basename.toLowerCase() === name.toLowerCase()
      );
      if (match) return { path: match.path, name: match.basename };
      // 也可能是不带后缀的路径
      return this.findNoteByPath(name, mdFiles);
    }

    // 情况4: 直接路径，带或不带 .md 后缀
    const cleaned = raw.replace(/\\/g, "/");
    if (cleaned.endsWith(".md")) {
      return this.findNoteByPath(cleaned, mdFiles);
    }
    // 不带 .md 后缀，尝试匹配
    return this.findNoteByPath(cleaned, mdFiles);
  }

  /** 根据路径查找笔记，支持带/不带 .md 后缀、完整路径或文件名 */
  private findNoteByPath(
    pathOrName: string,
    mdFiles: { path: string; basename: string }[]
  ): NoteReference | null {
    const cleaned = pathOrName.replace(/\\/g, "/");

    // 精确匹配路径（带 .md）
    let match = mdFiles.find((f) => f.path === cleaned);
    if (match) return { path: match.path, name: match.basename };

    // 带 .md 后缀匹配
    match = mdFiles.find((f) => f.path === cleaned + ".md");
    if (match) return { path: match.path, name: match.basename };

    // 路径结尾匹配（如 "folder/note.md"）
    match = mdFiles.find((f) => f.path.endsWith("/" + cleaned) || f.path.endsWith("/" + cleaned + ".md"));
    if (match) return { path: match.path, name: match.basename };

    // 仅文件名匹配（无路径前缀）
    const basename = cleaned.split("/").pop() || cleaned;
    match = mdFiles.find(
      (f) => f.basename === basename || f.basename === basename + ".md" ||
             f.basename.toLowerCase() === basename.toLowerCase()
    );
    if (match) return { path: match.path, name: match.basename };

    // 带 .md 后缀的纯文件名匹配
    if (basename.endsWith(".md")) {
      const name = basename.replace(/\.md$/, "");
      match = mdFiles.find(
        (f) => f.basename === name || f.basename.toLowerCase() === name.toLowerCase()
      );
      if (match) return { path: match.path, name: match.basename };
    }

    return null;
  }

  /** 将拖入的文件夹路径解析为该文件夹下所有 .md 文件 */
  private resolveFolderPath(
    raw: string,
    mdFiles: { path: string; basename: string }[]
  ): NoteReference[] {
    const cleaned = raw.replace(/\\/g, "/").replace(/\/$/, "");
    // 文件夹匹配：路径以 cleaned/ 开头的所有 .md 文件
    const prefix = cleaned + "/";
    const matches = mdFiles.filter((f) => f.path === cleaned || f.path.startsWith(prefix));
    return matches.map((f) => ({ path: f.path, name: f.basename }));
  }

  /** 从拖入文本中提取文件夹名称 */
  private extractFolderName(raw: string): string | null {
    const cleaned = raw.replace(/\\/g, "/").replace(/\/$/, "");
    // 尝试在 vault 中查找对应文件夹
    const file = this.app.vault.getAbstractFileByPath(cleaned);
    if (file instanceof TFolder) {
      return file.name;
    }
    // 提取路径最后一段作为名称
    const parts = cleaned.split("/");
    return parts[parts.length - 1] || null;
  }

  /** 从拖入文本中提取文件夹完整路径 */
  private extractFolderPath(raw: string): string | null {
    const cleaned = raw.replace(/\\/g, "/").replace(/\/$/, "");
    const file = this.app.vault.getAbstractFileByPath(cleaned);
    if (file instanceof TFolder) {
      return (file as any).path || cleaned;
    }
    return null;
  }

  /** 在输入框光标位置插入文本 */
  private insertRefAtCursor(text: string): void {
    this.insertTextAtCursor(text);
  }



  // ==================== 消息操作按钮 ====================

  /** Locate a message's absolute index in the handler by its DOM data-msg-id */
  private getHandlerIndexByDom(tab: ChatTab, msgEl: HTMLElement): number {
    const id = msgEl.getAttribute("data-msg-id");
    if (!id) return -1;
    return tab.handler.getMessages().findIndex((m) => m.id === id);
  }

  /** 渲染用户消息操作按钮 */
  private addUserActionButtons(msgEl: HTMLElement, tab: ChatTab): void {
    const actions = msgEl.createDiv("llm-chat-actions");

    const editBtn = actions.createDiv("llm-chat-action-btn");
    editBtn.innerHTML = Icons.edit(16);
    editBtn.setAttr("title", this.str("actionEdit"));
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.editUserMessage(tab, msgEl);
    });

    // 复制
    const copyBtn = actions.createDiv("llm-chat-action-btn");
    copyBtn.innerHTML = Icons.copy(16);
    copyBtn.setAttr("title", this.str("copyMessage"));
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const body = msgEl.querySelector(".llm-chat-body");
      const text = body?.textContent || "";
      await navigator.clipboard.writeText(text);
      copyBtn.innerHTML = Icons.check(16);
      copyBtn.setAttr("title", this.str("copiedMessage"));
      setTimeout(() => {
        copyBtn.innerHTML = Icons.copy(16);
        copyBtn.setAttr("title", this.str("copyMessage"));
      }, 1500);
    });

    // 删除
    const delBtn = actions.createDiv("llm-chat-action-btn");
    delBtn.innerHTML = Icons.trash2(16);
    delBtn.setAttr("title", this.str("actionDelete"));
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteSingleMessage(tab, msgEl);
    });
  }

  /** 渲染 AI 消息操作按钮 */
  private addAssistantActionButtons(msgEl: HTMLElement, tab: ChatTab, isStreaming: boolean): void {
    const actions = msgEl.createDiv("llm-chat-actions");

    // 插入笔记
    // Fork conversation from this AI reply
    const forkBtn = actions.createDiv("llm-chat-action-btn");
    forkBtn.innerHTML = Icons.split(16);
    forkBtn.setAttr("title", this.str("actionFork"));
    forkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.forkConversation(tab, msgEl);
    });
    const insertBtn = actions.createDiv("llm-chat-action-btn");
    insertBtn.innerHTML = Icons.filePlus(16);
    insertBtn.setAttr("title", this.str("actionInsertNote"));
    insertBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.insertToNote(msgEl);
    });

    // 复制
    const copyBtn = actions.createDiv("llm-chat-action-btn");
    copyBtn.innerHTML = Icons.copy(16);
    copyBtn.setAttr("title", this.str("copyMessage"));
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const body = msgEl.querySelector(".llm-chat-body");
      const text = body?.textContent || "";
      await navigator.clipboard.writeText(text);
      copyBtn.innerHTML = Icons.check(16);
      copyBtn.setAttr("title", this.str("copiedMessage"));
      setTimeout(() => {
        copyBtn.innerHTML = Icons.copy(16);
        copyBtn.setAttr("title", this.str("copyMessage"));
      }, 1500);
    });

    // 重新生成 / 刷新
    const regenBtn = actions.createDiv("llm-chat-action-btn");
    regenBtn.innerHTML = Icons.refresh(16);
    regenBtn.setAttr("title", this.str("actionRegenerate"));
    regenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.regenerateMessage(tab, msgEl);
    });

    // 删除
    const delBtn = actions.createDiv("llm-chat-action-btn");
    delBtn.innerHTML = Icons.trash2(16);
    delBtn.setAttr("title", this.str("actionDelete"));
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteSingleMessage(tab, msgEl);
    });
  }

  /** Fork conversation: open a new tab with messages up to and including the clicked message */
  private forkConversation(tab: ChatTab, msgEl: HTMLElement): void {
    const targetIdx = this.getHandlerIndexByDom(tab, msgEl);
    if (targetIdx < 0) return;
    const allMsgs = tab.handler.getMessages();
    const forked = allMsgs.slice(0, targetIdx + 1);

    this.addTab(true);
    const newTab = this.getActiveTab();
    if (!newTab) return;

    const welcome = newTab.containerEl.querySelector(".llm-chat-welcome");
    if (welcome) welcome.remove();

    newTab.handler.loadMessages(forked);

    newTab.containerEl.empty();
    for (const msg of forked) {
      if (msg.role === "user") this.renderUserMessage(newTab, msg.content || "", msg.id);
      else if (msg.role === "assistant" && !msg.tool_calls) this.renderAssistantMessage(newTab, msg.content || "", msg.id);
    }

    const firstNs = forked.find((m) => m.role !== "system");
    if (firstNs?.role === "user") {
      // 仅作为历史记录标题保存，标签仍由 renumberTabs 显示数字编号
      newTab.title = (firstNs.content || "").substring(0, 20);
      newTab.isDefaultTitle = false;
    }

    this.updateContextBar();
    // 瀹氫綅鍒板垎鍙夌粨鏋滃簳閮紙鏈€鏂颁竴鏉℃秷鎭級锛岀瓑 Markdown 寮傛娓叉煋瀹屾垚鍚庡啀婊氬姩
    setTimeout(() => {
      newTab.containerEl.scrollTop = newTab.containerEl.scrollHeight;
    }, 50);
  }

  /** 修改用户消息：内联编辑，直接在绿色泡泡中编辑，由底部发送键提交 */
  private editUserMessage(tab: ChatTab, msgEl: HTMLElement): void {
    // 已在编辑状态中：直接聚焦 textarea，不重复进入
    if (this.editingState && this.editingState.msgEl === msgEl) {
      this.editingState.textarea.focus();
      return;
    }

    const body = msgEl.querySelector(".llm-chat-body") as HTMLElement;
    if (!body) return;
    const origContent = body.textContent || "";

    // 清除之前的编辑状态
    this.cancelEdit();

    // 让泡泡宽度随内容自适应（不再锁死固定宽度，支持水平方向展开）
    const bubble = msgEl.querySelector(".llm-chat-bubble") as HTMLElement;
    if (bubble) {
      bubble.style.width = "fit-content";
      bubble.style.maxWidth = "100%";
    }

    // 替换为 textarea（绿色泡泡中，透明背景）
    body.empty();
    const textarea = body.createEl("textarea");
    textarea.value = origContent;
    textarea.style.cssText =
      "height:auto;min-height:24px;padding:0;margin:0;border:none;border-radius:0;background:transparent;color:inherit;font-size:13px;line-height:1.5;font-family:inherit;resize:none;outline:none;box-shadow:none;overflow:hidden;word-wrap:break-word;";
    textarea.focus();
    // 光标放到末尾，不自动全选
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // 隐藏的测量元素：用于按最长行测量文字宽度，实现水平方向自适应
    const measureSpan = document.createElement("span");
    measureSpan.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font-size:13px;line-height:1.5;font-family:inherit;";
    document.body.appendChild(measureSpan);

    // 自动调整高度与宽度（随文字增加自适应，水平方向也能展开）
    const autoResize = () => {
      // 垂直方向
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
      // 水平方向：测量最长行宽度，限制不超过泡泡父容器可用宽度
      const cs = getComputedStyle(textarea);
      measureSpan.style.fontFamily = cs.fontFamily;
      measureSpan.style.fontSize = cs.fontSize;
      measureSpan.style.fontWeight = cs.fontWeight;
      measureSpan.style.fontStyle = cs.fontStyle;
      measureSpan.style.letterSpacing = cs.letterSpacing;
      let maxW = 0;
      const lines = textarea.value.split("\n");
      for (const ln of lines) {
        measureSpan.textContent = ln.length ? ln : " ";
        maxW = Math.max(maxW, measureSpan.offsetWidth);
      }
      const allow = (bubble?.parentElement?.clientWidth ?? textarea.clientWidth) - 32;
      textarea.style.width = Math.min(maxW + 4, Math.max(allow, 80)) + "px";
    };
    textarea.addEventListener("input", autoResize);
    setTimeout(autoResize, 0);

    // 标记泡泡为编辑状态
    msgEl.addClass("llm-chat-editing");

    // 存储编辑状态
    this.editingState = { tab, msgEl, origContent, textarea, measureSpan };

    // Escape 取消编辑
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.cancelEdit();
      }
    });
  }

  /** 取消编辑，恢复原文 */
  private cancelEdit(): void {
    if (!this.editingState) return;
    const { msgEl, origContent, measureSpan } = this.editingState;
    // 移除文字宽度测量元素
    measureSpan?.remove();
    // 恢复泡泡宽度为自适应
    const bubble = msgEl.querySelector(".llm-chat-bubble") as HTMLElement;
    if (bubble) {
      bubble.style.width = "";
      bubble.style.maxWidth = "";
    }
    // 恢复 body 内容
    const body = msgEl.querySelector(".llm-chat-body") as HTMLElement;
    if (body) {
      body.empty();
      body.setText(origContent);
    }
    msgEl.removeClass("llm-chat-editing");
    this.editingState = null;
  }

  /** 提交编辑并发送 */
  private async commitEditAndSend(): Promise<void> {
    if (!this.editingState) return;
    const { tab, msgEl, origContent, textarea, measureSpan } = this.editingState;
    // 移除文字宽度测量元素
    measureSpan?.remove();
    const newContent = textarea.value.trim();

    if (!newContent) {
      this.cancelEdit();
      return;
    }

    // 清除编辑 UI 状态
    msgEl.removeClass("llm-chat-editing");
    this.editingState = null;

    // 更新泡泡显示为新内容
    const body = msgEl.querySelector(".llm-chat-body") as HTMLElement;
    if (body) {
      body.empty();
      body.setText(newContent);
    }

    // 定位被编辑消息在 handler 中的绝对索引
    const targetIdx = this.getHandlerIndexByDom(tab, msgEl);
    if (targetIdx < 0) return;
    const handlerMsgs = tab.handler.getMessages();

    // 保留到当前消息（含）为止
    const keep = new Set<number>();
    handlerMsgs.forEach((m, i) => {
      if (m.role === "system") { keep.add(i); return; }
      if (i <= targetIdx) keep.add(i);
    });

    const newMsgs = handlerMsgs.filter((_m, i) => keep.has(i));
    if (newMsgs[targetIdx]) {
      newMsgs[targetIdx] = { ...newMsgs[targetIdx], content: newContent };
    }

    tab.handler.loadMessages(newMsgs);

    // 重新渲染
    tab.containerEl.empty();
    for (const msg of newMsgs) {
      if (msg.role === "system") continue;
      if (msg.role === "user") this.renderUserMessage(tab, msg.content || "", msg.id);
      else if (msg.role === "assistant" && !msg.tool_calls) this.renderAssistantMessage(tab, msg.content || "", msg.id);
    }

    // 发送修改后的消息
    this.sendEditedMessage(tab, newContent);
  }

  /** 发送编辑后的消息 */
  private async sendEditedMessage(tab: ChatTab, content: string): Promise<void> {
    try {
      await tab.handler.sendMessage(content);
      this.updateContextBar();
      this.saveTabToHistory(tab);
    } catch (e) {
      console.error("[Sedimind] 发送编辑消息失败:", e);
    }
  }

  /** 删除单条消息（用户消息连带后续 AI 回复） */
  private deleteSingleMessage(tab: ChatTab, msgEl: HTMLElement): void {
    const targetIdx = this.getHandlerIndexByDom(tab, msgEl);
    if (targetIdx < 0) return;
    const handlerMsgs = tab.handler.getMessages();
    const isUser = handlerMsgs[targetIdx].role === "user";

    const keep = new Set<number>();
    handlerMsgs.forEach((m, i) => {
      if (m.role === "system") { keep.add(i); return; }
      if (isUser) {
        if (i < targetIdx) keep.add(i);
      } else {
        if (i !== targetIdx) keep.add(i);
      }
    });

    const newMsgs = handlerMsgs.filter((_m, i) => keep.has(i));
    tab.handler.loadMessages(newMsgs);

    // 重新渲染
    tab.containerEl.empty();
    if (newMsgs.every(m => m.role === "system")) {
      this.addWelcomeMessage(tab);
    } else {
      for (const msg of newMsgs) {
        if (msg.role === "system") continue;
        if (msg.role === "user") this.renderUserMessage(tab, msg.content || "", msg.id);
        else if (msg.role === "assistant" && !msg.tool_calls) this.renderAssistantMessage(tab, msg.content || "", msg.id);
      }
    }

    this.updateContextBar();
    this.saveTabToHistory(tab);
  }

  /** 插入笔记：将 AI 回复的选中文字（或全部内容）插入到活跃编辑器光标处 */
  private insertToNote(msgEl: HTMLElement): void {
    const selection = window.getSelection();
    let content = "";

    // 检查是否有选中文字
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (msgEl.contains(range.commonAncestorContainer)) {
        content = selection.toString().trim();
      }
    }

    // 未选中则取全部内容
    if (!content) {
      const body = msgEl.querySelector(".llm-chat-body");
      content = body?.textContent?.trim() || "";
    }

    if (!content) return;

    // 查找活跃编辑器
    const activeView = this.app.workspace.activeEditor;
    const editor = activeView?.editor;
    if (editor) {
      const cursor = editor.getCursor();
      editor.replaceRange(content, cursor);
      new Notice(`已插入到笔记`);
    } else {
      new Notice("没有活跃的编辑器");
    }
  }

  /** 重新生成 AI 回复 */
  private async regenerateMessage(tab: ChatTab, msgEl: HTMLElement): Promise<void> {
    const targetIdx = this.getHandlerIndexByDom(tab, msgEl);
    if (targetIdx < 0) return;
    const handlerMsgs = tab.handler.getMessages();

    const keep = new Set<number>();
    handlerMsgs.forEach((m, i) => {
      if (m.role === "system") { keep.add(i); return; }
      if (i < targetIdx) keep.add(i);
    });

    const newMsgs = handlerMsgs.filter((_m, i) => keep.has(i));
    tab.handler.loadMessages(newMsgs);

    // 重新渲染
    tab.containerEl.empty();
    for (const msg of newMsgs) {
      if (msg.role === "system") continue;
      if (msg.role === "user") this.renderUserMessage(tab, msg.content || "", msg.id);
      else if (msg.role === "assistant" && !msg.tool_calls) this.renderAssistantMessage(tab, msg.content || "", msg.id);
    }

    // 找到最后一条用户消息并重新发送
    const lastUser = [...newMsgs].reverse().find(m => m.role === "user");
    if (lastUser) {
      try {
        await tab.handler.sendMessage(lastUser.content || "");
        this.updateContextBar();
        this.saveTabToHistory(tab);
      } catch (e) {
        console.error("[Sedimind] 重新生成失败:", e);
      }
    }
  }

  // ==================== 内联编辑 ====================

  /** 内联编辑标签页标题 */
  private editTabTitleInline(tab: ChatTab): void {
    const btn = tab.tabBtn;
    const currentTitle = tab.title;
    btn.empty();

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentTitle;
    input.className = "llm-chat-tab-edit-input";
    input.style.cssText = "width:100%;border:none;background:var(--background-primary);color:var(--text-normal);font-size:12px;padding:2px 4px;border-radius:4px;outline:none;";
    btn.appendChild(input);
    input.focus();
    input.select();

    const finishEdit = () => {
      const newTitle = input.value.trim() || currentTitle;
      tab.title = newTitle;
      tab.isDefaultTitle = false;
      btn.empty();
      btn.setText(newTitle.length > 20 ? newTitle.substring(0, 20) + "..." : newTitle);
    };

    input.addEventListener("blur", finishEdit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finishEdit(); }
      if (e.key === "Escape") {
        e.preventDefault();
        btn.empty();
        btn.setText(currentTitle.length > 20 ? currentTitle.substring(0, 20) + "..." : currentTitle);
      }
    });
  }

  /** 内联编辑历史记录标题 */
  private async editHistoryTitleInline(titleEl: HTMLElement, record: ConversationRecord, list: HTMLElement): Promise<void> {
    const currentTitle = record.title;
    titleEl.empty();

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentTitle;
    input.className = "llm-chat-tab-edit-input";
    input.style.cssText = "width:90%;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-size:14px;padding:2px 6px;border-radius:4px;outline:none;";
    titleEl.appendChild(input);
    input.focus();
    input.select();

    const finishEdit = async () => {
      const newTitle = input.value.trim() || currentTitle;
      titleEl.empty();
      titleEl.setText(newTitle);

      // 保存到历史记录
      const records = await this.loadHistory();
      const idx = records.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        records[idx].title = newTitle;
        records[idx].customTitle = true;
        await this.saveHistory(records);
      }
    };

    input.addEventListener("blur", finishEdit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finishEdit(); }
      if (e.key === "Escape") {
        e.preventDefault();
        titleEl.empty();
        titleEl.setText(currentTitle);
      }
    });
  }

  // ==================== 工具 ====================


  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }
}
