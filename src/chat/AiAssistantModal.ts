import { App, Modal, Editor, MarkdownRenderer, Component } from "obsidian";
import { MessageHandler, UICallbacks } from "./MessageHandler";
import { ChatView } from "./ChatView";
import { LLMChatSettings } from "../settings";
import { t, Language } from "../i18n";
import { Icons } from "../icons";
import { OllamaProvider } from "../llm/OllamaProvider";
import { AtMenu, AtReferenceData } from "./AtMenu";
import { McpManager } from "../mcp/McpManager";
import { MemoryManager } from "../memory/MemoryManager";

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

/** AI 编辑助手的专用系统提示词 */
const EDITOR_ASSISTANT_PROMPT = `You are a text editing assistant embedded in an Obsidian editor.
The user will give you source text and editing instructions.
Your ONLY task: return the modified/final text directly.
RULES:
- Output ONLY the modified text, nothing else.
- No explanations, no markdown code fences (\`\`\`), no extra formatting.
- Do NOT wrap the result in quotes.
- If the instruction is "translate to English", output only the English text.
- If the instruction is "fix grammar", output only the corrected text.
- The output will directly replace the user's selected text in the editor.`;

export class AiAssistantModal extends Modal {
  private settings: LLMChatSettings;
  private handler: MessageHandler;
  private chatView: ChatView | null;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private chatMessagesEl: HTMLElement;
  private streamingBubble: HTMLElement | null = null;
  private isProcessing = false;
  private currentAssistantMsg: HTMLElement | null = null;
  private isStreaming = false;
  private lang: Language;
  private editor: Editor | null = null;
  private selectedText: string = "";
  /** 预置指令（如从划词工具栏「翻译」按钮进入，自动填充并发送） */
  private presetInstruction: string = "";
  private presetSourceText: string = "";

  // 编辑器修改状态（用于撤销）
  private originalSelection: string = "";
  private fromPos: { line: number; ch: number } = { line: 0, ch: 0 };
  private toPos: { line: number; ch: number } = { line: 0, ch: 0 };
  private changesApplied = false;

  // 预览模式状态
  private previewContent = "";
  private hasPreview = false;
  private confirmBtn: HTMLButtonElement;

  // 拖拽状态
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private modalStartLeft = 0;
  private modalStartTop = 0;

  // @ 引用
  private noteReferences: NoteReference[] = [];
  private folderReferences: { path: string; name: string }[] = [];
  private urlReferences: { url: string; name: string }[] = [];
  private atMenu: AtMenu | null = null;

  constructor(
    app: App,
    settings: LLMChatSettings,
    chatView?: ChatView,
    mcpManager?: McpManager,
    memoryManager?: MemoryManager,
    opts?: { instruction?: string; sourceText?: string }
  ) {
    super(app);
    this.settings = { ...settings };
    this.chatView = chatView || null;
    this.lang = (settings.language as Language) || "zh";
    this.handler = this.createHandler(mcpManager, memoryManager);
    this.presetInstruction = opts?.instruction || "";
    this.presetSourceText = opts?.sourceText || "";
  }

  private str(key: string, params?: Record<string, string>): string {
    return t(key, this.lang, params);
  }

  private createHandler(mcpManager?: McpManager, memoryManager?: MemoryManager): MessageHandler {
    const ui: UICallbacks = {
      onUserMessage: (content) => this.onUserMessage(content),
      onAssistantChunk: (content) => this.updateStreaming(content),
      onAssistantMessage: (content) => this.finalizeMessage(content),
      onToolCall: () => {},
      onToolResult: () => {},
      onError: (msg) => this.renderError(msg),
      onThinking: () => {},
    };
    return new MessageHandler(this.app, this.settings, ui, EDITOR_ASSISTANT_PROMPT, mcpManager, memoryManager);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("llm-chat-ai-bar-body");
    modalEl.addClass("llm-chat-ai-bar-el");

    // 捕获编辑器上下文
    this.captureEditorContext();
    // 若由划词工具栏带入源文本（如翻译），以传入文本为准
    if (this.presetSourceText) {
      this.selectedText = this.presetSourceText;
      this.originalSelection = this.presetSourceText;
    }

    // 设置弹窗初始位置
    this.resetModalPosition();

    // ---- 顶部拖拽条（copilot 同款细长横条）----
    const dragBar = contentEl.createDiv("llm-chat-ai-bar-drag");

    // ---- 对话展示区（类似侧边栏消息列表，显示在输入框上方）----
    this.chatMessagesEl = contentEl.createDiv("llm-chat-ai-bar-chat");

    // 如果有划词选中文本，渲染为 AI 回复风格的上下文气泡
    if (this.selectedText) {
      const msgEl = this.chatMessagesEl.createDiv("llm-chat-ai-bar-msg assistant context");
      const bubble = msgEl.createDiv("llm-chat-ai-bar-bubble");
      const displayText = this.selectedText.length > 200
        ? this.selectedText.substring(0, 200) + "…"
        : this.selectedText;
      bubble.setText(displayText);
    }

    // ---- 输入区域容器（Pixso 设计稿 12:1775）----
    const inputWrap = contentEl.createDiv("llm-chat-ai-bar-input-wrap");

    this.inputEl = inputWrap.createEl("textarea", {
      cls: "llm-chat-ai-bar-input",
      attr: {
        placeholder: this.str("aiAssistantInputPlaceholder"),
        rows: "1",
      },
    });
    this.inputEl.value = this.presetInstruction || ""; // 预置指令时直接填入，否则留空
    // 聚焦时强制清空（防止 Obsidian/浏览器回填选中内容）；预置指令时不清空
    this.inputEl.addEventListener("focus", () => {
      if (this.inputEl && this.inputEl.value !== "" && !this.presetInstruction) {
        this.inputEl.value = "";
      }
    }, { once: true });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
      // @ 符号触发引用菜单
      if (e.key === "@") {
        setTimeout(() => {
          const val = this.inputEl.value;
          const cursorPos = this.inputEl.selectionStart;
          if (val.charAt(cursorPos - 1) === "@") {
            this.openAtReferenceMenu();
          }
        }, 50);
      }
    });

    // 监听中文输入法等场景下的 @ 输入
    this.inputEl.addEventListener("input", () => {
      const val = this.inputEl.value;
      const cursorPos = this.inputEl.selectionStart || 0;
      if (val.charAt(cursorPos - 1) === "@") {
        const beforeAt = val.charAt(cursorPos - 2);
        if (beforeAt === "" || beforeAt === " " || beforeAt === "\n") {
          this.openAtReferenceMenu();
        }
      }
    });

    // 发送按钮（Pixso 绿色实心圆 + 白色箭头）
    this.sendBtn = inputWrap.createEl("button", {
      cls: "llm-chat-ai-bar-send",
      attr: { title: this.str("aiAssistantSend") },
    });
    this.sendBtn.innerHTML = Icons.pixsoSend(12);
    this.sendBtn.addEventListener("click", () => this.send());

    // ---- 底部按钮行（模型选择器 + 确认修改）—— Grid 三列布局 ----
    const bottomRow = contentEl.createDiv("llm-chat-ai-bar-bottom");

    // 模型选择下拉栏（左侧）
    this.modelSelect = bottomRow.createEl("select", { cls: "llm-chat-ai-bar-model-select" });
    this.populateModelSelect(this.modelSelect);
    this.modelSelect.addEventListener("change", () => this.onModelSelectChange());

    // 确认修改按钮（中间，预览模式时显示）
    this.confirmBtn = bottomRow.createEl("button", { cls: "llm-chat-ai-bar-confirm-btn" });
    this.confirmBtn.innerHTML = `${Icons.check(12)}<span>${this.str("aiAssistantConfirm")}</span>`;
    this.confirmBtn.style.display = "none";
    this.confirmBtn.addEventListener("click", () => this.onConfirm());

    // 初始化拖拽（用拖拽条作为拖拽柄）
    this.initDrag(modalEl, dragBar);

    // 延迟清空并聚焦输入框（避免 Obsidian Modal 内部机制回填内容）
    setTimeout(() => {
      if (this.inputEl) {
        if (!this.presetInstruction) this.inputEl.value = "";
        this.inputEl.focus();
      }
    }, 150);

    // 预置指令（如翻译）：自动填充并发送
    if (this.presetInstruction) {
      setTimeout(() => this.send(), 220);
    }
  }

  onClose(): void {
    // 用户确认后关闭 = 正常流程，无需撤销
    // changesApplied 由 onConfirm() 设置
    this.contentEl.empty();
  }

  // ==================== 拖拽支持 ====================

  private resetModalPosition(): void {
    const el = this.modalEl;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const modalW = 360;
    el.style.position = "fixed";
    el.style.left = `${Math.round((vw - modalW) / 2)}px`;
    el.style.top = `${Math.round(vh * 0.15)}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
    el.style.margin = "0";
    el.style.width = `${modalW}px`;
    el.style.height = "auto";
    el.style.maxHeight = `${Math.min(480, vh - 60)}px`;
  }

  private initDrag(modalEl: HTMLElement, handleEl: HTMLElement): void {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 允许关闭按钮、下拉框、复选框、按钮等正常交互
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "SELECT" ||
        target.tagName === "INPUT" ||
        target.tagName === "LABEL" ||
        target.closest("button") ||
        target.closest("select") ||
        target.closest("input")
      ) {
        return;
      }

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      const rect = modalEl.getBoundingClientRect();
      this.modalStartLeft = rect.left;
      this.modalStartTop = rect.top;
      handleEl.style.cursor = "grabbing";
      modalEl.style.transition = "none";
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      modalEl.style.left = `${this.modalStartLeft + dx}px`;
      modalEl.style.top = `${this.modalStartTop + dy}px`;
    };

    const onMouseUp = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      handleEl.style.cursor = "grab";
      modalEl.style.transition = "";
    };

    handleEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    this.containerEl.addEventListener("destroy", cleanup);
    window.addEventListener("beforeunload", cleanup, { once: true });
  }

  // ==================== 编辑器上下文 ====================

  private captureEditorContext(): void {
    const markdownView = this.app.workspace.activeLeaf?.view;
    if (markdownView && "editor" in markdownView) {
      const ed = (markdownView as any).editor as Editor;
      if (ed) {
        this.editor = ed;
        const selection = ed.getSelection();
        if (selection) {
          this.selectedText = selection;
          this.originalSelection = selection;
          this.fromPos = ed.getCursor("from");
          this.toPos = ed.getCursor("to");
        }
      }
    }
  }

  // ==================== 模型选择器 ====================

  private async populateModelSelect(select: HTMLSelectElement): Promise<void> {
    select.empty();
    const options = await this.getModelOptions();
    for (const opt of options) {
      const optEl = select.createEl("option", {
        text: opt.label,
        value: `${opt.provider}::${opt.model}`,
      });
      if (opt.provider === this.settings.provider && opt.model === this.getCurrentModel()) {
        optEl.selected = true;
      }
    }
  }

  private getCurrentModel(): string {
    const s = this.settings as any;
    return s[`${this.settings.provider}Model`] || "";
  }

  private async getModelOptions(): Promise<ModelOption[]> {
    const s = this.settings as any;
    const options: ModelOption[] = [];

    // 仅显示已配置API Key的云端模型
    if (s.openaiApiKey?.trim()) {
      options.push({ provider: "openai", model: s.openaiModel || "gpt-4o", label: `OpenAI / ${s.openaiModel || "gpt-4o"}` });
    }
    if (s.anthropicApiKey?.trim()) {
      options.push({ provider: "anthropic", model: s.anthropicModel || "claude-3-5-sonnet-20241022", label: `Anthropic / ${s.anthropicModel || "claude-3-5-sonnet-20241022"}` });
    }
    if (s.deepseekApiKey?.trim()) {
      options.push({ provider: "deepseek", model: s.deepseekModel || "deepseek-chat", label: `DeepSeek / ${s.deepseekModel || "deepseek-chat"}` });
    }
    if (s.claudeCodeBaseUrl?.trim()) {
      options.push({ provider: "claude-code", model: s.claudeCodeModel || "claude-code-cli", label: `Claude Code / ${s.claudeCodeModel || "claude-code-cli"}` });
    }
    if (s.codexBaseUrl?.trim()) {
      options.push({ provider: "codex", model: s.codexModel || "codex-cli", label: `Codex / ${s.codexModel || "codex-cli"}` });
    }

    // Ollama 本地模型：拉取所有已部署的模型
    try {
      const ollamaModels = await OllamaProvider.fetchModels(s.ollamaBaseUrl || "http://localhost:11434");
      if (ollamaModels.length > 0) {
        for (const m of ollamaModels) {
          options.push({ provider: "ollama", model: m.name, label: `Ollama / ${m.name}` });
        }
      } else {
        if (s.ollamaModel) {
          options.push({ provider: "ollama", model: s.ollamaModel, label: `Ollama / ${s.ollamaModel}` });
        }
      }
    } catch {
      if (s.ollamaModel) {
        options.push({ provider: "ollama", model: s.ollamaModel, label: `Ollama / ${s.ollamaModel}` });
      }
    }

    return options;
  }

  // ==================== 发送消息 ====================

  public getInputElement(): HTMLTextAreaElement | null {
    return this.inputEl;
  }

  private async send(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.inputEl) return;
    let instruction = this.inputEl.value.trim();
    if (!instruction) return;

    this.inputEl.value = "";
    if (this.sendBtn) this.sendBtn.disabled = true;
    this.isProcessing = true;

    // 在对话区渲染用户指令气泡（只显示用户输入的指令，不含划词上下文）
    const userMsgEl = this.chatMessagesEl.createDiv("llm-chat-ai-bar-msg user");
    const userBubble = userMsgEl.createDiv("llm-chat-ai-bar-bubble");
    userBubble.setText(instruction);
    this.scrollChatToBottom();

    // 撤销上一次的临时修改（仅首次之前可能有）
    if (this.changesApplied) {
      this.revertEditorChanges();
    }
    this.changesApplied = false;

    // 将 @笔记名 引用还原为 [[path]]，让 LLM 理解完整文件路径
    for (const ref of this.noteReferences) {
      instruction = instruction.split(`@${ref.name}`).join(`[[${ref.path}]]`);
    }

    // 文件夹引用：替换 @文件夹名/ 为该文件夹下所有笔记的列表，包含完整路径
    for (const ref of this.folderReferences) {
      const folder = this.app.vault.getAbstractFileByPath(ref.path);
      if (folder) {
        const notes = this.app.vault.getMarkdownFiles()
          .filter((f) => f.path.startsWith(ref.path + "/") || f.path.startsWith(ref.path));
        const noteList = notes.map((n) => `- [[${n.path}]]`).join("\n");
        instruction = instruction.split(`@${ref.name}/`).join(
          `\n📁 文件夹 "${ref.name}"（路径：${ref.path}）中的笔记：\n${noteList || "（空文件夹）"}\n`
        );
      }
    }

    // 网址引用：追加 URL 信息
    if (this.urlReferences.length > 0) {
      instruction += "\n\n**引用的网址：**\n";
      for (const ref of this.urlReferences) {
        instruction += `- [${ref.name}](${ref.url})\n`;
      }
    }

    // 构建消息：区分模式
    let message: string;
    if (this.hasPreview) {
      // 迭代修改：提供当前预览 + 新指令
      message = `当前内容：\n"""\n${this.previewContent}\n"""\n\n修改指令：${instruction}`;
    } else if (this.selectedText) {
      // 首次发送（有选中文字）
      message = `源文本：\n"""\n${this.selectedText}\n"""\n\n指令：${instruction}`;
    } else {
      message = instruction;
    }

    // 同步到侧边栏（如果存在）
    this.syncUserMessageToSidebar(message);

    try {
      await this.handler.sendMessage(message);
    } catch (e) {
      this.renderError(e instanceof Error ? e.message : String(e));
    } finally {
      if (this.sendBtn) this.sendBtn.disabled = false;
      this.isProcessing = false;
    }
  }

  // ==================== 消息回调 ====================

  private onUserMessage(content: string): void {
    // 用户指令气泡已在 send() 中渲染，这里只保证滚动到底
    this.scrollChatToBottom();
  }

  private updateStreaming(content: string): void {
    this.isStreaming = true;
    if (!this.streamingBubble) {
      const msgEl = this.chatMessagesEl.createDiv("llm-chat-ai-bar-msg assistant streaming");
      this.streamingBubble = msgEl.createDiv("llm-chat-ai-bar-bubble");
    }
    this.streamingBubble.setText(content);
    this.scrollChatToBottom();
    this.updateModalSize();
  }

  private finalizeMessage(content: string): void {
    this.isStreaming = false;
    this.previewContent = this.cleanContent(content);

    if (this.streamingBubble) {
      const parent = this.streamingBubble.parentElement;
      if (parent) {
        parent.classList.remove("streaming");
        this.streamingBubble.empty();
        MarkdownRenderer.renderMarkdown(content, this.streamingBubble, "", new Component());
      }
      this.streamingBubble = null;
    } else {
      const msgEl = this.chatMessagesEl.createDiv("llm-chat-ai-bar-msg assistant");
      const bubble = msgEl.createDiv("llm-chat-ai-bar-bubble");
      MarkdownRenderer.renderMarkdown(content, bubble, "", new Component());
    }
    this.scrollChatToBottom();

    if (!this.hasPreview) {
      this.hasPreview = true;
      this.transitionToPreviewMode();
    }

    this.updateModalSize();
    this.syncAssistantMessageToSidebar(content);
  }

  /** 清理 markdown 代码块包裹 */
  private cleanContent(content: string): string {
    let result = content;
    const codeBlockMatch = result.match(/^```[\w]*\n([\s\S]*?)\n```$/);
    if (codeBlockMatch) {
      result = codeBlockMatch[1];
    }
    return result.trim();
  }

  private renderError(message: string): void {
    this.isStreaming = false;
    this.streamingBubble = null;

    const msgEl = this.chatMessagesEl.createDiv("llm-chat-ai-bar-msg error");
    const bubble = msgEl.createDiv("llm-chat-ai-bar-bubble");
    bubble.setText(message);
    this.scrollChatToBottom();

    if (!this.hasPreview) {
      this.hasPreview = true;
      this.transitionToPreviewMode();
    }
    this.updateModalSize();
  }

  /** 对话区滚动到底部 */
  private scrollChatToBottom(): void {
    if (this.chatMessagesEl) {
      requestAnimationFrame(() => {
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
      });
    }
  }

  // ==================== 预览模式 ====================

  /** 首次 AI 响应后切换到预览模式 */
  private transitionToPreviewMode(): void {
    // 修改输入框 placeholder
    this.inputEl.placeholder = this.str("quickCommandEditPlaceholder");

    // 显示确认按钮
    this.confirmBtn.style.display = "";
  }

  /** 更新弹窗整体尺寸以容纳预览内容 */
  private updateModalSize(): void {
    this.modalEl.style.height = "auto";
    this.modalEl.style.maxHeight = `${Math.min(480, window.innerHeight - 60)}px`;
  }

  /** 模型选择器变更 */
  private onModelSelectChange(): void {
    if (!this.modelSelect) return;
    const [provider, model] = this.modelSelect.value.split("::");
    if (!provider || !model) return;

    const s = this.settings as any;
    s.provider = provider;
    const modelKey = `${provider}Model`;
    if (modelKey in s) {
      s[modelKey] = model;
    }

    // 重建 handler 以使用新的 provider/model
    this.handler = this.createHandler();
  }

  /** 确认修改：应用到编辑器并关闭 */
  private onConfirm(): void {
    if (!this.previewContent) return;
    this.applyEditorChanges(this.previewContent);
    this.close();
  }

  // ==================== 编辑器修改 ====================

  private applyEditorChanges(text: string): void {
    if (!this.editor || !text) return;
    try {
      if (this.selectedText) {
        this.editor.replaceRange(text, this.fromPos, this.toPos);
      } else {
        const cursor = this.editor.getCursor();
        this.editor.replaceRange(text, cursor);
      }
      this.changesApplied = true;
    } catch (e) {
      this.renderError("无法修改编辑器内容：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  private revertEditorChanges(): void {
    if (!this.editor || !this.selectedText || !this.changesApplied) return;
    try {
      this.editor.replaceRange(this.originalSelection, this.fromPos, this.toPos);
      this.changesApplied = false;
    } catch {
      // 静默失败
    }
  }

  // ==================== 侧边栏同步 ====================

  private syncUserMessageToSidebar(content: string): void {
    if (!this.chatView) return;
    try {
      (this.chatView as any).appendQuickCommandMessageSilent?.("user", content);
    } catch {
      // 静默失败，不影响弹窗功能
    }
  }

  private syncAssistantMessageToSidebar(content: string): void {
    if (!this.chatView) return;
    try {
      (this.chatView as any).appendQuickCommandMessageSilent?.("assistant", content);
    } catch {
      // 静默失败，不影响弹窗功能
    }
  }

  // ==================== @ 引用选择 ====================

  /** @ 符号触发引用菜单 */
  private openAtReferenceMenu(): void {
    this.openAtMenu(true);
  }

  /** 统一的 @ 引用菜单入口 */
  private openAtMenu(isFromAtSign: boolean): void {
    if (!this.inputEl) return;
    if (this.atMenu) {
      this.atMenu.close();
      this.atMenu = null;
    }

    const cursorPos = this.inputEl.selectionStart || this.inputEl.value.length;
    const anchorEl = this.inputEl;

    this.atMenu = new AtMenu(
      this.app,
      this.lang,
      (data: AtReferenceData) => {
        this.onAtMenuSelect(data);
      },
      () => {
        this.atMenu = null;
      }
    );

    this.atMenu.show(anchorEl, this.inputEl, cursorPos, isFromAtSign);
  }

  /** 处理 @ 菜单选择 */
  private onAtMenuSelect(data: AtReferenceData): void {
    switch (data.type) {
      case "note":
        if (!this.noteReferences.find((r) => r.path === data.path)) {
          this.noteReferences.push({ path: data.path!, name: data.name });
        }
        break;
      case "folder":
        if (!this.folderReferences.find((r) => r.path === data.path)) {
          this.folderReferences.push({ path: data.path!, name: data.name });
        }
        break;
      case "url":
        if (!this.urlReferences.find((r) => r.url === data.url)) {
          this.urlReferences.push({ url: data.url!, name: data.name });
        }
        break;
    }
  }
}
