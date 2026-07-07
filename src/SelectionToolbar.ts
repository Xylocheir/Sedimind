import { App, Editor, MarkdownView, SuggestModal, TFile } from "obsidian";
import { ChatView } from "./chat/ChatView";
import { AiAssistantModal } from "./chat/AiAssistantModal";
import { LLMChatSettings } from "./settings";
import { Icons } from "./icons";
import { t, Language } from "./i18n";
import { TOOLBAR_BUTTONS, normalizeToolbarMain, normalizeToolbarSubmenu, ToolbarAction, ToolbarOp } from "./toolbarConfig";

/**
 * 划词工具栏 — 当用户在笔记中选中文字后，在选区附近显示浮动工具栏。
 *
 * 设计参考：Pixso 花瓣设计稿 — 白色药丸形，绿色边框
 * 布局：[AI] [文本工具] [翻译] [高亮] [@] [复制] [更多]
 *
 * 功能按钮：
 *   - AI 助手（绿色圆形）：打开AI助手弹窗并填入选中文字
 *   - 文本工具 T（点击展开子菜单）：标题、加粗、斜体、删除线、高亮、代码、自定义格式
 *   - 翻译：调用AI翻译选中文字
 *   - 高亮：一键高亮选中文字
 *   - 添加引用 @：将选中文字作为引用发送到对话
 *   - 复制：复制选中文字到剪贴板
 *   - 更多 ⋮：彩色高亮圆点、语音输入、设置
 */
export class SelectionToolbar {
  private app: App;
  private settings: LLMChatSettings;
  private chatView: ChatView | null;
  private toolbarEl: HTMLElement | null = null;
  private submenuEl: HTMLElement | null = null;
  private hideTimeout: number | null = null;
  private submenuHideTimeout: number | null = null;
  /** 自定义提示框（替代原生 title，避免 Obsidian 绿色 tooltip 且可控制到最顶层） */
  private customTooltip: HTMLElement | null = null;
  /** 选词结束后的防抖计时器 */
  private selectionDebounce: number | null = null;
  private lastMouseX = 0;
  private lastMouseY = 0;
  /** 防止重复创建 */
  private isShowing = false;
  /** 鼠标是否处于按下状态（拖拽选词中） */
  private isMouseDown = false;
  /** 已注册的 document 监听器引用（用于 destroy 时移除，避免热重载累积多套监听器导致多个工具栏） */
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundSelectionChange: (() => void) | null = null;

  // 高亮颜色定义（与图片中的6个彩色圆点一致）
  static readonly HIGHLIGHT_COLORS = [
    { name: "yellow", color: "#E8B930", bg: "rgba(232,185,48,0.25)" },
    { name: "green",  color: "#4DAF51", bg: "rgba(77,175,81,0.25)" },
    { name: "blue",   color: "#3E8BD8", bg: "rgba(62,139,216,0.25)" },
    { name: "pink",   color: "#E8599B", bg: "rgba(232,89,155,0.25)" },
    { name: "orange", color: "#EB8321", bg: "rgba(235,131,33,0.25)" },
    { name: "purple", color: "#8E44AD", bg: "rgba(142,68,173,0.25)" },
  ];

  constructor(app: App, settings: LLMChatSettings, chatView: ChatView | null) {
    this.app = app;
    this.settings = settings;
    this.chatView = chatView;
  }

  /**
   * 同步最新的 ChatView 引用。
   * 关键：构造时聊天视图可能尚未打开（chatView 为 null），
   * 必须在视图创建后由宿主调用本方法更新，否则内部持有的永远是 null 快照。
   */
  public setChatView(chatView: ChatView | null): void {
    this.chatView = chatView;
  }

  /** 初始化：监听文档选择变化 */
  init(): void {
    // 跟踪鼠标位置和拖拽状态
    this.boundMouseMove = (e: MouseEvent) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    };
    document.addEventListener("mousemove", this.boundMouseMove);

    this.boundMouseDown = (e: MouseEvent) => {
      this.isMouseDown = true;
      // 点击工具栏外部时隐藏
      if (this.toolbarEl && !this.toolbarEl.contains(e.target as Node) && !this.submenuEl?.contains(e.target as Node)) {
        this.hide();
      }
    };
    document.addEventListener("mousedown", this.boundMouseDown);

    this.boundMouseUp = (e: MouseEvent) => {
      this.isMouseDown = false;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      // 松手后延迟检查选词，避免拖拽过程中工具栏频繁弹出
      this.scheduleSelectionCheck();
    };
    document.addEventListener("mouseup", this.boundMouseUp);

    this.boundSelectionChange = () => {
      // 鼠标按下期间（正在拖拽选词），不响应 selectionchange，避免闪烁
      if (this.isMouseDown) return;
      // 非拖拽场景（如双击选词、Ctrl+A 全选）仍正常响应
      this.onSelectionChange();
    };
    document.addEventListener("selectionchange", this.boundSelectionChange);
  }

  private onSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      this.scheduleHide();
      return;
    }

    // 检查是否在 markdown 编辑器中
    const activeView = this.app.workspace.activeLeaf?.view;
    if (!(activeView instanceof MarkdownView)) {
      this.scheduleHide();
      return;
    }

    const editor = activeView.editor;
    const selectedText = selection.toString().trim();
    if (!selectedText) {
      this.scheduleHide();
      return;
    }

    // 获取选中文字在屏幕上的位置
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      this.scheduleHide();
      return;
    }

    // 显示工具栏
    this.showToolbar(rect, editor, selectedText, activeView);
  }

  // ==================== 主工具栏构建 ====================

  private showToolbar(
    rect: DOMRect,
    editor: Editor,
    selectedText: string,
    view: MarkdownView
  ): void {
    // 防御：清除页面上任何残留的划词工具栏（避免插件热重载导致多实例重复创建）
    document.querySelectorAll(".llm-chat-selection-toolbar").forEach((el) => el.remove());

    // 防抖：如果已经正在显示，先移除旧的
    if (this.isShowing) {
      this.hideImmediate();
    }
    this.isShowing = true;
    this.cancelHide();

    const toolbar = document.createElement("div");
    toolbar.className = "llm-chat-selection-toolbar";
    toolbar.setAttribute("role", "toolbar");

    // ---- 可配置主栏：按 settings.selectionToolbarMainOrder 渲染（文本工具按钮点击展开子菜单） ----
    const mainOrder = normalizeToolbarMain(this.settings);
    for (const id of mainOrder) {
      const def = TOOLBAR_BUTTONS[id];
      if (!def) continue;
      if (def.group === "texttool") {
        const btn = this.createIconBtn(toolbar, def.icon, def.label, () => {
          this.toggleSubmenu(btn, editor, view, selectedText);
        });
        btn.dataset.selBtn = def.id;
        btn.addClass("llm-st-fmt-btn");
        btn.addEventListener("mouseenter", () => {
          this.showSubmenu(btn, editor, view, selectedText);
        });
      } else if (def.kind === "action" && def.action) {
        const btn = this.createIconBtn(toolbar, def.icon, def.label, () => {
          this.handleAction(def.action!, editor, view, selectedText);
        });
        btn.dataset.selBtn = def.id;
        if (def.id === "ai") btn.addClass("llm-st-ai-btn");
        else btn.addClass("llm-st-fmt-btn");
      } else if (def.op) {
        const btn = this.createIconBtn(toolbar, def.icon, def.label, () => {
          this.handleFormatOp(def.op!, editor);
        });
        btn.dataset.selBtn = def.id;
        btn.addClass("llm-st-fmt-btn");
        if (def.id === "highlight") btn.addClass("llm-st-highlight-btn");
      }
    }

    // 插入 DOM — 先隐藏再同步定位，避免 requestAnimationFrame 造成的延迟闪烁

    toolbar.style.visibility = "hidden";
    toolbar.style.pointerEvents = "none";
    document.body.appendChild(toolbar);
    this.toolbarEl = toolbar;

    // 同步定位（强制 reflow 以获取尺寸，再设定最终位置）
    this.positionToolbar(toolbar, rect);

    // 显示
    toolbar.style.visibility = "";
    toolbar.style.pointerEvents = "";

    // 工具栏自身 hover：取消主工具栏与子菜单的自动隐藏计时
    toolbar.addEventListener("mouseenter", () => {
      this.cancelHide();
      this.cancelSubmenuHide();
    });
    toolbar.addEventListener("mouseleave", (e) => {
      // 如果鼠标移动到了子菜单内，不触发隐藏（悬停子菜单时下拉保持展开）
      if (this.submenuEl && this.submenuEl.contains(e.relatedTarget as Node)) return;
      // 离开整个工具栏区域：主工具栏 1 秒后关闭，下拉子菜单 250ms 后收起
      this.scheduleHide();
      this.scheduleSubmenuHide();
    });
  }

  /** 工具栏定位：默认出现在鼠标光标上方，空间不足则翻转到下方 */
  private positionToolbar(toolbar: HTMLElement, rect: DOMRect): void {
    const tbRect = toolbar.getBoundingClientRect();
    const tbH = tbRect.height;
    const tbW = tbRect.width;
    const gap = 6;      // 与光标/选区的间距
    const padding = 12; // 与窗口边缘的最小距离

    // 水平定位：以鼠标位置为中心，否则选区居中
    const anchorX = this.lastMouseX > 0 ? this.lastMouseX : rect.left + rect.width / 2;
    let left = anchorX - tbW / 2;
    if (left < padding) left = padding;
    if (left + tbW > window.innerWidth - padding) left = window.innerWidth - tbW - padding;

    // 默认放在光标上方（以鼠标 Y 为准，选区兜底）
    const cursorY = this.lastMouseY > 0 ? this.lastMouseY : rect.top;
    let top = cursorY - tbH - gap - 15;
    let above = true;

    // 上方空间不足 → 翻转到选区下方
    if (top < padding) {
      top = rect.bottom + gap;
      above = false;
      // 下方也放不下 → 贴近窗口底部
      if (top + tbH > window.innerHeight - padding) {
        top = window.innerHeight - padding - tbH;
      }
    }

    // 若光标上方已有工具栏（如 Obsidian 原生格式化工具栏/已有划词工具栏），上移到其上方避免相互压着
    if (above) {
      top = this.nudgeAboveExistingToolbar(toolbar, left, top, tbW, tbH, gap, padding);
    }

    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  /** 当工具栏位于光标上方时，若与已有工具栏垂直重叠则上移到其上方 */
  private nudgeAboveExistingToolbar(
    toolbar: HTMLElement,
    left: number,
    top: number,
    tbW: number,
    tbH: number,
    gap: number,
    padding: number,
  ): number {
    const right = left + tbW;
    const candidates = document.querySelectorAll<HTMLElement>(
      ".llm-chat-selection-toolbar, .llm-st-submenu, .cm-formatting-prompt, [class*='formatting-toolbar'], [class*='cm-toolbar']"
    );
    let adjusted = top;
    candidates.forEach((el) => {
      if (el === toolbar) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // 仅当水平方向有交集
      if (r.right < left - gap || r.left > right + gap) return;
      // 仅当该元素与工具栏垂直重叠时，把工具栏挪到其上方
      if (r.top < top + tbH && r.bottom > top) {
        const newTop = r.top - tbH - gap;
        if (newTop >= padding && newTop < adjusted) adjusted = newTop;
      }
    });
    return adjusted;
  }

  /** 添加工具栏箭头指示器 */
  private addArrowIndicator(toolbar: HTMLElement, direction: "top" | "bottom"): void {
    const arrow = toolbar.createDiv({ cls: `llm-st-arrow llm-st-arrow-${direction}` });
    // 箭头水平居中
    arrow.style.left = `calc(50% - 5px)`;
  }

  // ==================== 格式化操作 ====================
  // ===== 已移除文本格式化子菜单 =====

  /** 应用高亮 ==text== 并附带颜色信息 */
  private applyHighlight(editor: Editor, color: string): void {
    const sel = editor.getSelection();
    if (!sel) return;
    editor.replaceSelection(`==${sel}==`);
  }

  /** 应用文本格式化（支持 toggle） */
  private applyFormat(editor: Editor, prefix: string, suffix: string): void {
    const sel = editor.getSelection();
    if (!sel) return;
    // 已有该格式则移除（toggle）
    if (prefix && suffix && sel.startsWith(prefix) && sel.endsWith(suffix)) {
      const inner = sel.slice(prefix.length, sel.length - suffix.length);
      editor.replaceSelection(inner);
    } else if (!suffix && sel.startsWith(prefix)) {
      // 标题类（只有前缀）
      editor.replaceSelection(sel.slice(prefix.length));
    } else {
      editor.replaceSelection(`${prefix}${sel}${suffix}`);
    }
  }

  /** 应用标题格式（基于整行，确保 Markdown 标题生效；再次点击取消） */
  private applyHeading(editor: Editor, marker: string): void {
    const sel = editor.getSelection();
    if (!sel) return;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const startLine = from.line;
    const endLine = to.line;

    // 判断是否所有选中行都已是该标题（用于切换取消）
    let allMatch = true;
    for (let i = startLine; i <= endLine; i++) {
      const line = editor.getLine(i);
      if (line !== marker && !line.startsWith(marker + " ")) {
        allMatch = false;
        break;
      }
    }

    const newLines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = editor.getLine(i);
      const stripped = line.replace(/^#{1,6}\s?/, "");
      newLines.push(allMatch ? stripped : `${marker} ${stripped}`);
    }

    const lastLineLen = editor.getLine(endLine).length;
    editor.replaceRange(
      newLines.join("\n"),
      { line: startLine, ch: 0 },
      { line: endLine, ch: lastLineLen }
    );
  }

  // ==================== 可配置格式操作 ====================

  private handleAction(action: ToolbarAction, editor: Editor, view: MarkdownView, selectedText: string): void {
    switch (action) {
      case "ai": this.openAiAssistant("", selectedText, view); break;
      case "translate": this.openAiAssistant(this.t("translateAuto"), selectedText, view); break;
      case "ref": if (this.chatView) this.chatView.addSelectionChip(selectedText); break;
      case "copy":
        navigator.clipboard.writeText(selectedText).catch(() => {});
        break;
      case "settings": this.openSettings(); break;
    }
    this.hide();
  }

  private handleFormatOp(op: ToolbarOp, editor: Editor): void {
    switch (op) {
      case "bold": this.applyFormat(editor, "**", "**"); break;
      case "italic": this.applyFormat(editor, "*", "*"); break;
      case "underline": this.applyFormat(editor, "<u>", "</u>"); break;
      case "strike": this.applyFormat(editor, "~~", "~~"); break;
      case "highlight": this.applyHighlight(editor, SelectionToolbar.HIGHLIGHT_COLORS[0].color); break;
      case "sup": this.applyFormat(editor, "<sup>", "</sup>"); break;
      case "sub": this.applyFormat(editor, "<sub>", "</sub>"); break;
      case "h1": this.applyHeading(editor, "# "); break;
      case "h2": this.applyHeading(editor, "## "); break;
      case "h3": this.applyHeading(editor, "### "); break;
      case "h4": this.applyHeading(editor, "#### "); break;
      case "h5": this.applyHeading(editor, "##### "); break;
      case "h6": this.applyHeading(editor, "###### "); break;
      case "ol": this.applyList(editor, "1. "); break;
      case "ul": this.applyList(editor, "- "); break;
      case "task": this.applyTaskList(editor); break;
      case "table": this.applyTable(editor); break;
      case "file": this.applyFileEmbed(editor); break;
      case "math": this.applyMath(editor); break;
    }
    this.hide();
  }

  private applyList(editor: Editor, marker: string): void {
    const sel = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (!sel) { editor.replaceSelection(marker); return; }
    const text = sel.split("\n").map((l) => marker + l).join("\n");
    editor.replaceRange(text, from, to);
  }

  private applyTaskList(editor: Editor): void {
    const sel = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (!sel) { editor.replaceSelection("- [ ] "); return; }
    const text = sel.split("\n").map((l) => "- [ ] " + l).join("\n");
    editor.replaceRange(text, from, to);
  }

  private applyTable(editor: Editor): void {
    const tpl = "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
    editor.replaceSelection(tpl);
  }

  private applyMath(editor: Editor): void {
    const sel = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (!sel) { editor.replaceSelection("$  $"); return; }
    const wrapped = sel.includes("\n") ? ("\n$$\n" + sel + "\n$$\n") : ("$" + sel + "$");
    editor.replaceRange(wrapped, from, to);
  }

  private applyFileEmbed(editor: Editor): void {
    const modal = new FileSuggestModal(this.app, (file) => {
      editor.replaceSelection("![[ " + file.basename + " ]]");
    });
    modal.open();
  }

  // ==================== UI 工厂方法 ====================

  /** 创建图标按钮（使用自定义 tooltip 替代原生 title，避免 Obsidian 绿色提示框） */
  private createIconBtn(
    parent: HTMLElement,
    svgIcon: string,
    tooltip: string,
    onClick?: () => void
  ): HTMLElement {
    const btn = parent.createDiv({ cls: "llm-st-icon-btn" });
    btn.innerHTML = svgIcon;
    // 自定义 tooltip：悬停时显示在按钮上方（与子菜单条目统一风格，置于最顶层）
    btn.addEventListener("mouseenter", () => this.showTooltip(tooltip, btn, "top"));
    btn.addEventListener("mouseleave", () => this.hideTooltip());
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
  }

  /** 显示自定义提示框（side: "top" 在元素上方居中 / "right" 在元素右侧） */
  private showTooltip(label: string, el: HTMLElement, side: "top" | "right" = "right"): void {
    if (!label) return;
    this.hideTooltip();
    const tip = document.createElement("div");
    tip.className = "llm-st-tooltip";
    tip.textContent = label;
    document.body.appendChild(tip);
    this.customTooltip = tip;

    const rect = el.getBoundingClientRect();
    let left: number;
    let top: number;
    if (side === "right") {
      left = rect.right + 8;
      top = rect.top + rect.height / 2 - tip.offsetHeight / 2;
    } else {
      left = rect.left + rect.width / 2 - tip.offsetWidth / 2;
      top = rect.top - tip.offsetHeight - 8;
    }
    // 边界钳制，避免溢出窗口
    const pad = 6;
    if (left < pad) left = pad;
    if (left + tip.offsetWidth > window.innerWidth - pad) left = window.innerWidth - tip.offsetWidth - pad;
    if (top < pad) top = rect.bottom + 8; // 上方空间不足则翻到下方
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  /** 隐藏自定义提示框 */
  private hideTooltip(): void {
    if (this.customTooltip) {
      this.customTooltip.remove();
      this.customTooltip = null;
    }
  }

  /** 创建分隔线 */
  private createDivider(parent: HTMLElement): HTMLElement {
    return parent.createDiv({ cls: "llm-st-divider" });
  }

  // ==================== 文本工具子菜单 ====================

  /** 点击文本工具按钮：切换子菜单显示 */
  private toggleSubmenu(btn: HTMLElement, editor: Editor, view: MarkdownView, selectedText: string): void {
    if (this.submenuEl) {
      this.hideSubmenu();
      return;
    }
    this.showSubmenu(btn, editor, view, selectedText);
  }

  /** 显示文本工具子菜单（列出已勾选的格式按钮） */
  private showSubmenu(anchorBtn: HTMLElement, editor: Editor, view: MarkdownView, selectedText: string): void {
    this.hideSubmenu();
    const sub = document.createElement("div");
    sub.className = "llm-st-submenu";
    const ids = normalizeToolbarSubmenu(this.settings);
    for (const id of ids) {
      const def = TOOLBAR_BUTTONS[id];
      if (!def || !def.op) continue;
      const item = this.createIconBtn(sub, def.icon, def.label, () => {
        this.handleFormatOp(def.op!, editor);
      });
      item.dataset.selBtn = def.id;
      item.addClass("llm-st-submenu-item");
    }
    if (!sub.children.length) {
      const empty = sub.createDiv({ cls: "llm-st-submenu-empty", text: "（未选择格式）" });
      empty.style.padding = "6px 12px";
      empty.style.fontSize = "12px";
    }
    // 子菜单作为工具栏的子元素悬挂在其下方/上方，与工具栏共享连续描边（一体化「T 形」外观）
    sub.style.visibility = "hidden";
    this.toolbarEl!.appendChild(sub);
    this.submenuEl = sub;

    // 水平居中于文本工具按钮（offsetLeft/offsetWidth 相对工具栏 padding box）
    const btnLeft = anchorBtn.offsetLeft;
    const btnW = anchorBtn.offsetWidth;
    let left = btnLeft + btnW / 2 - sub.offsetWidth / 2;
    if (left < -4) left = -4;

    // 默认向下展开；工具栏下方空间不足则向上展开
    const tbRect = this.toolbarEl!.getBoundingClientRect();
    let opensUp = false;
    if (tbRect.bottom + sub.offsetHeight > window.innerHeight - 8) {
      opensUp = true;
    }
    sub.addClass(opensUp ? "llm-st-submenu-up" : "llm-st-submenu-down");
    sub.style.left = `${left}px`;
    sub.style.visibility = "";

    // 悬停行为：进入子菜单取消隐藏，离开后延迟收起
    sub.addEventListener("mouseenter", () => {
      this.cancelHide();
      this.cancelSubmenuHide();
    });
    sub.addEventListener("mouseleave", (e) => {
      if (this.toolbarEl && this.toolbarEl.contains(e.relatedTarget as Node)) return;
      this.scheduleHide();
      this.scheduleSubmenuHide();
    });
  }

  // ==================== 功能方法 ====================

  private openAiAssistant(instruction: string, sourceText: string, view: MarkdownView): void {
    import("./chat/AiAssistantModal").then(({ AiAssistantModal }) => {
      const modal = new AiAssistantModal(
        this.app,
        this.settings,
        this.chatView || undefined,
        undefined,
        undefined,
        { instruction, sourceText }
      );
      modal.open();
      setTimeout(() => {
        const inputEl = modal.getInputElement();
        if (inputEl) {
          inputEl.focus();
        }
      }, 150);
    });
  }

  private openSettings(): void {
    // 打开 Obsidian 设置并跳转到本插件设置页
    (this.app as any).setting?.open?.();
    (this.app as any).setting?.openTabById?.("llm-chat-assistant");
  }

  // ==================== 显示/隐藏控制 ====================

  private hide(): void {
    if (!this.isShowing) return;
    this.isShowing = false;
    this.hideImmediate();
  }

  private hideImmediate(): void {
    if (this.toolbarEl) {
      this.toolbarEl.remove();
      this.toolbarEl = null;
    }
    this.hideSubmenu();
    this.hideTooltip();
    this.cancelHide();
    this.cancelSelectionDebounce();
  }

  private scheduleHide(): void {
    if (!this.isShowing) return;
    // 主工具栏在鼠标离开后 1 秒自动隐藏（下拉子菜单的收起计时由 scheduleSubmenuHide 单独控制为 250ms）
    this.hideTimeout = window.setTimeout(() => this.hide(), 1000);
  }

  private cancelHide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.cancelSubmenuHide();
  }

  /** 鼠标松开后延迟显示工具栏，确保选词操作已完全结束 */
  private scheduleSelectionCheck(): void {
    this.cancelSelectionDebounce();
    this.selectionDebounce = window.setTimeout(() => {
      this.selectionDebounce = null;
      this.onSelectionChange();
    }, 200);
  }

  private cancelSelectionDebounce(): void {
    if (this.selectionDebounce) {
      clearTimeout(this.selectionDebounce);
      this.selectionDebounce = null;
    }
  }

  private hideSubmenu(): void {
    if (this.submenuEl) {
      this.submenuEl.remove();
      this.submenuEl = null;
    }
  }

  private scheduleSubmenuHide(): void {
    this.cancelSubmenuHide();
    this.submenuHideTimeout = window.setTimeout(() => this.hideSubmenu(), 250);
  }

  private cancelSubmenuHide(): void {
    if (this.submenuHideTimeout) {
      clearTimeout(this.submenuHideTimeout);
      this.submenuHideTimeout = null;
    }
  }

  // ==================== 国际化 ====================

  private get lang(): Language {
    return (this.settings.language as Language) || "zh";
  }

  // 快捷映射：t("highlight") → t("selToolbarHighlight", lang)
  private t(key: string): string {
    const map: Record<string, string> = {
      highlight: "Highlight",
      textTools: "TextTools",
      translate: "Translate",
      translateAuto: "TranslateAuto",
      voiceInput: "VoiceInput",
      addRef: "AddRef",
      aiAssistant: "AiAssistant",
      customSettings: "Customize",
      translatePrompt: "TranslatePrompt",
      heading1: "Heading1",
      heading2: "Heading2",
      heading3: "Heading3",
      bold: "Bold",
      italic: "Italic",
      strike: "Strike",
      underline: "Underline",
      highlightFmt: "HighlightFmt",
      code: "Code",
      customFormat: "CustomFormat",
      copy: "Copy",
    };
    const suffix = map[key] ?? key;
    return t(`selToolbar${suffix}`, this.lang);
  }

  destroy(): void {
    this.cancelSelectionDebounce();
    this.hide();
    // 移除 document 级监听器，防止插件热重载后旧监听器残留、多实例重复创建工具栏
    if (this.boundMouseMove) document.removeEventListener("mousemove", this.boundMouseMove);
    if (this.boundMouseDown) document.removeEventListener("mousedown", this.boundMouseDown);
    if (this.boundMouseUp) document.removeEventListener("mouseup", this.boundMouseUp);
    if (this.boundSelectionChange) document.removeEventListener("selectionchange", this.boundSelectionChange);
    this.boundMouseMove = null;
    this.boundMouseDown = null;
    this.boundMouseUp = null;
    this.boundSelectionChange = null;
  }
}

class FileSuggestModal extends SuggestModal<TFile> {
  private files: TFile[];
  private onChoose: (file: TFile) => void;
  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.files = app.vault.getMarkdownFiles();
    this.onChoose = onChoose;
    this.setPlaceholder("选择要嵌入的笔记…");
  }
  getSuggestions(query: string): TFile[] {
    const q = query.toLowerCase();
    return this.files.filter((f) => f.path.toLowerCase().includes(q));
  }
  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }
  onChooseSuggestion(file: TFile): void {
    this.onChoose(file);
  }
}

// ==================== 扩展图标：文本格式子菜单 Lucide 图标 ====================
namespace StIcons {
  // 设置 — Lucide settings
  export function settingsCog(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  // 标题1 — Lucide heading-1
  export function heading1(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/></svg>`;
  }
  // 标题2 — Lucide heading-2
  export function heading2(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>`;
  }
  // 粗体 — Lucide bold
  export function bold(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>`;
  }
  // 斜体 — Lucide italic
  export function italic(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4h-9 M14 20H5 M15 4l-6 16"/></svg>`;
  }
  // 删除线 — Lucide strikethrough
  export function strikethrough(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/></svg>`;
  }
  // 高亮 — Lucide highlighter
  export function highlight(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;
  }
  // 代码 — Lucide code
  export function code(s = 16): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>`;
  }

  // ==================== 文本格式子菜单图标（来自 src/assets，Pixso 14×14 风格） ====================

  // 标题 2 — heading-2
  export function h2(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<path d="M2 7L7 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M2 11L2 3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M7 11L7 3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M13 11L10 11C10 8.41669 13 9.06252 13 7.12504C13 6.1563 11.5 5.51047 10 6.47921" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `</svg>`;
  }

  // 标题 3 — heading-3
  export function h3(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<path d="M2 7L7 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M2 11L2 3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M7 11L7 3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M11 6.20629C11.9714 5.6938 13 6.20629 13 6.97502C13 7.15494 12.9472 7.3317 12.8469 7.48751C12.7466 7.64333 12.6023 7.77272 12.4286 7.86268C12.2548 7.95264 12.0578 8 11.8571 8" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M10 10.5123C11.5 11.589 13 10.7276 13 9.4356C13 9.1836 12.9307 8.93604 12.799 8.7178C12.6674 8.49956 12.478 8.31833 12.25 8.19233C12.022 8.06633 11.7633 8 11.5 8" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `</svg>`;
  }

  // 粗体 — Bold
  export function fmtBold(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<path d="M3.5 7.00001L8.75 7.00001C9.24275 7.00001 9.72285 7.156 10.1215 7.44564C10.5201 7.73527 10.8169 8.14367 10.9691 8.6123C11.1214 9.08094 11.1214 9.58575 10.9691 10.0544C10.8169 10.523 10.5201 10.9314 10.1215 11.2211C9.72285 11.5107 9.24275 11.6667 8.75 11.6667L4.08333 11.6667C3.98094 11.6667 3.88034 11.6397 3.79167 11.5885C3.70299 11.5373 3.62935 11.4637 3.57815 11.375C3.52695 11.2863 3.5 11.1857 3.5 11.0833L3.5 2.91668C3.5 2.81428 3.52695 2.71369 3.57815 2.62501C3.62935 2.53633 3.70299 2.46269 3.79167 2.4115C3.88034 2.3603 3.98094 2.33334 4.08333 2.33334L8.16667 2.33334C8.65942 2.33334 9.13952 2.48934 9.53817 2.77897C9.93681 3.0686 10.2335 3.477 10.3858 3.94564C10.5381 4.41427 10.5381 4.91908 10.3858 5.38772C10.2335 5.85635 9.93681 6.26475 9.53817 6.55438C9.13952 6.84402 8.65942 7.00001 8.16667 7.00001" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `</svg>`;
  }

  // 斜体 — Italic
  export function fmtItalic(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<line x1="0" x2="5.25" y1="0" y2="0" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667" transform="matrix(-1,0,0,-1,11.0835,2.33331)"/>`
      + `<line x1="0" x2="5.25" y1="0" y2="0" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667" transform="matrix(-1,0,0,-1,8.1665,11.6667)"/>`
      + `<line x1="0" x2="9.96800327" y1="0" y2="0" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667" transform="matrix(-0.351123,0.936329,-0.936329,-0.351123,8.75,2.33331)"/>`
      + `</svg>`;
  }

  // 删除线 — Strikethrough
  export function fmtStrike(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<path d="M9.33327 2.33331L5.24994 2.33331C4.9699 2.33317 4.69391 2.40023 4.44516 2.52887C4.19641 2.65751 3.98216 2.84396 3.82042 3.07258C3.65868 3.30119 3.55416 3.56528 3.51565 3.84266C3.47714 4.12004 3.50576 4.40262 3.59911 4.66665" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<path d="M8.16667 7C8.65942 7 9.13952 7.15599 9.53817 7.44563C9.93681 7.73526 10.2335 8.14366 10.3858 8.61229C10.5381 9.08093 10.5381 9.58574 10.3858 10.0544C10.2335 10.523 9.93681 10.9314 9.53817 11.221C9.13952 11.5107 8.65942 11.6667 8.16667 11.6667L3.5 11.6667" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<line x1="2.33349609" x2="11.6668291" y1="7" y2="7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `</svg>`;
  }

  // 下划线 — Underline
  export function underline(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<path d="M3.5 2.33331L3.5 5.83331C3.5 6.57244 3.73399 7.29259 4.16844 7.89056C4.60289 8.48853 5.21549 8.93361 5.91844 9.16201C6.62139 9.39041 7.37861 9.39041 8.08156 9.16201C8.78451 8.93361 9.39711 8.48853 9.83156 7.89056C10.266 7.29259 10.5 6.57244 10.5 5.83331L10.5 2.33331" fill-rule="nonzero" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `<line x1="2.33349609" x2="11.6668291" y1="11.666687" y2="11.666687" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.166667"/>`
      + `</svg>`;
  }

  // 设置 — settings-2
  export function settings2(s = 14): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none">`
      + `<path d="M8.3385 10.9925L2.31497 10.9925C2.20996 10.9925 2.114 10.9706 2.0271 10.9269C1.89953 10.8647 1.79671 10.7619 1.73451 10.6343C1.6908 10.5474 1.66895 10.4515 1.66895 10.3465C1.66895 10.2415 1.6908 10.1455 1.73451 10.0586C1.79671 9.93103 1.89953 9.82821 2.02709 9.766C2.114 9.72229 2.20996 9.70044 2.31497 9.70044L8.3385 9.70044L8.34273 9.70045C8.44609 9.70103 8.54064 9.72288 8.62637 9.766C8.75393 9.82821 8.85676 9.93103 8.91896 10.0586C8.96267 10.1455 8.98452 10.2415 8.98452 10.3465C8.98452 10.4515 8.96267 10.5474 8.91896 10.6343C8.85675 10.7619 8.75393 10.8647 8.62636 10.9269C8.53946 10.9706 8.4435 10.9925 8.3385 10.9925Z" fill="currentColor" fill-rule="evenodd"/>`
      + `<path d="M11.6852 4.29962L5.66165 4.29962C5.55664 4.29962 5.46068 4.27776 5.37377 4.23405C5.24621 4.17185 5.14339 4.06903 5.08119 3.94147C5.03748 3.85456 5.01562 3.7586 5.01562 3.65359C5.01562 3.54858 5.03748 3.45262 5.08119 3.36572C5.14339 3.23816 5.24621 3.13534 5.37377 3.07313C5.46068 3.02942 5.55664 3.00757 5.66165 3.00757L11.6852 3.00757L11.6894 3.00758C11.7928 3.00816 11.8873 3.03001 11.9731 3.07313C12.1006 3.13533 12.2034 3.23816 12.2656 3.36572C12.3093 3.45263 12.3312 3.54858 12.3312 3.65359C12.3312 3.7586 12.3093 3.85456 12.2656 3.94146C12.2034 4.06903 12.1006 4.17185 11.973 4.23406C11.8861 4.27776 11.7902 4.29962 11.6852 4.29962Z" fill="currentColor" fill-rule="evenodd"/>`
      + `<path d="M9.32747 12.806C9.64024 12.9355 9.97983 13.0003 10.3462 13.0003C10.7127 13.0003 11.0523 12.9355 11.365 12.806C11.6778 12.6764 11.9637 12.4821 12.2228 12.223C12.4819 11.9639 12.6762 11.678 12.8058 11.3652C12.9353 11.0524 13.0001 10.7129 13.0001 10.3464C13.0001 9.98001 12.9353 9.64042 12.8058 9.32766C12.6762 9.0149 12.4819 8.72897 12.2228 8.46987C11.9637 8.21076 11.6778 8.01644 11.365 7.88689C11.0523 7.75734 10.7127 7.69257 10.3463 7.69257C9.97983 7.69257 9.64024 7.75734 9.32747 7.88689C9.01471 8.01644 8.72878 8.21077 8.46968 8.46987C8.21058 8.72897 8.01626 9.0149 7.88671 9.32766C7.75716 9.64042 7.69238 9.98001 7.69238 10.3464C7.69238 10.7129 7.75716 11.0524 7.88671 11.3652C8.01626 11.678 8.21058 11.9639 8.46968 12.223C8.72878 12.4821 9.01471 12.6764 9.32747 12.806ZM11.3676 11.3678C11.1406 11.5948 10.8002 11.7083 10.3463 11.7083C9.89231 11.7083 9.55186 11.5948 9.32489 11.3678C9.09792 11.1408 8.98443 10.8004 8.98443 10.3464C9.89231 10.1584 9.01767 9.98415 9.08415 9.82365C9.15063 9.66316 9.25034 9.51644 9.3833 9.38348C9.51625 9.25053 9.66298 9.15081 9.82347 9.08433C9.98396 9.01785 10.1582 8.98461 10.3462 8.98461C10.8002 8.98461 11.1406 9.0981 11.3676 9.32507C11.5946 9.55204 11.7081 9.89249 11.7081 10.3464C11.7081 10.8004 11.5946 11.1408 11.3676 11.3678Z" fill="currentColor" fill-rule="evenodd"/>`
      + `<path d="M2.63509 6.11311C2.94785 6.24265 3.28745 6.30743 3.65387 6.30743C4.02029 6.30743 4.35988 6.24266 4.67264 6.11311C4.9854 5.98356 5.27133 5.78923 5.53043 5.53013C5.78953 5.27103 5.98386 4.9851 6.11341 4.67234C6.24296 4.35958 6.30773 4.01999 6.30773 3.65356C6.30773 3.28714 6.24296 2.94755 6.11341 2.63478C5.98386 2.32202 5.78953 2.03609 5.53044 1.77699C5.27134 1.51789 4.9854 1.32357 4.67264 1.19402C4.35988 1.06447 4.02029 0.999695 3.65387 0.999695C3.28745 0.999695 2.94785 1.06447 2.63509 1.19402C2.32233 1.32357 2.0364 1.51789 1.7773 1.77699C1.5182 2.03609 1.32388 2.32202 1.19433 2.63479C1.06478 2.94755 1 3.28714 1 3.65356C1 4.01998 1.06477 4.35958 1.19432 4.67234C1.32387 4.9851 1.5182 5.27103 1.7773 5.53013C2.0364 5.78923 2.32233 5.98356 2.63509 6.11311ZM4.67523 4.67493C4.44826 4.9019 4.10781 5.01538 3.65387 5.01538C3.19993 5.01538 2.85947 4.9019 2.6325 4.67493C2.40553 4.44796 2.29205 4.1075 2.29205 3.65356C2.29205 3.19962 2.40553 2.85917 2.6325 2.6322C2.85947 2.40523 3.19993 2.29174 3.65387 2.29174C4.10781 2.29174 4.44826 2.40523 4.67523 2.6322C4.9022 2.85917 5.01569 3.19962 5.01569 3.65356C5.01569 4.1075 4.9022 4.44796 4.67523 4.67493Z" fill="currentColor" fill-rule="evenodd"/>`
      + `</svg>`;
  }
}
