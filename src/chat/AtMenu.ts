import { App, TFile, TFolder } from "obsidian";
import { Icons } from "../icons";
import { t, Language } from "../i18n";

// ==================== 类型定义 ====================

export type AtRefType = "note" | "folder" | "url";

export interface AtReferenceData {
  type: AtRefType;
  /** 笔记：文件路径 */
  path?: string;
  /** 显示名称 */
  name: string;
  /** URL：完整 URL 地址 */
  url?: string;
}

type AtMenuState = "main" | "notes" | "folders" | "url";

// ==================== @ 引用弹出菜单 ====================

export class AtMenu {
  private el!: HTMLDivElement;
  private contentEl!: HTMLDivElement;
  private app: App;
  private lang: Language;
  private onSelect: (data: AtReferenceData) => void;
  private onClose: () => void;

  private state: AtMenuState = "main";
  private searchQuery = "";
  private allNotes: TFile[] = [];
  private folderTree: { path: string; name: string; indent: number; isFolder: boolean }[] = [];
  private urlValue = "";
  private selectedIndex = 0;

  private inputEl!: HTMLTextAreaElement;
  private cursorPos = 0;
  private isFromAtSign = false;

  private disposeDocClick: (() => void) | null = null;
  private lastAnchor: HTMLElement | null = null;

  // ==================== 构造函数 ====================

  constructor(
    app: App,
    lang: Language,
    onSelect: (data: AtReferenceData) => void,
    onClose: () => void
  ) {
    this.app = app;
    this.lang = lang;
    this.onSelect = onSelect;
    this.onClose = onClose;
  }

  private str(key: string, params?: Record<string, string>): string {
    return t(key, this.lang, params);
  }

  // ==================== 显示/关闭 ====================

  show(
    anchorEl: HTMLElement,
    inputEl: HTMLTextAreaElement,
    cursorPos: number,
    isFromAtSign: boolean
  ): void {
    this.inputEl = inputEl;
    this.cursorPos = cursorPos;
    this.isFromAtSign = isFromAtSign;
    this.state = "main";
    this.searchQuery = "";
    this.urlValue = "";
    this.selectedIndex = 0;

    // 预加载数据
    this.allNotes = this.app.vault.getMarkdownFiles();
    this.buildFolderTree();

    // 创建 DOM
    this.el = document.createElement("div");
    this.el.className = "llm-at-menu";
    this.render();

    // 定位
    this.position(anchorEl);

    // 挂载
    document.body.appendChild(this.el);

    // 点击外部关闭
    this.disposeDocClick = this.listenDocClick();
  }

  close(): void {
    this.disposeDocClick?.();
    this.disposeDocClick = null;
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.onClose();
  }

  // ==================== 定位 ====================

  private position(anchorEl: HTMLElement): void {
    this.lastAnchor = anchorEl;
    const menuWidth = 320;

    const anchorRect = anchorEl.getBoundingClientRect();
    const actualHeight = this.el.offsetHeight || 326;

    let left = anchorRect.left + (anchorRect.width - menuWidth) / 2;
    let top = anchorRect.top - actualHeight - 48;

    if (top < 8) {
      top = anchorRect.bottom + 8;
    }

    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 12) {
      left = window.innerWidth - menuWidth - 12;
    }

    if (top + actualHeight > window.innerHeight - 12) {
      top = window.innerHeight - actualHeight - 12;
    }

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  // ==================== 外部点击关闭 ====================

  private listenDocClick(): () => void {
    const handler = (e: MouseEvent) => {
      if (this.el && !this.el.contains(e.target as Node)) {
        this.close();
      }
    };
    setTimeout(() => document.addEventListener("click", handler, true), 0);
    return () => document.removeEventListener("click", handler, true);
  }

  // ==================== 渲染 ====================

  private render(): void {
    this.el.empty();
    this.el.addEventListener("keydown", (e) => this.handleKeyDown(e));

    // 可滚动内容区
    this.contentEl = this.el.createDiv("llm-at-menu-content");

    switch (this.state) {
      case "main":
        this.renderMainContent();
        break;
      case "notes":
        this.renderNotesContent();
        break;
      case "folders":
        this.renderFoldersContent();
        break;
      case "url":
        this.renderUrlContent();
        break;
    }

    // 底部搜索栏（URL 面板除外）
    if (this.state !== "url") {
      this.renderBottomSearch();
    }

    // 重新定位，确保菜单位置正确
    setTimeout(() => {
      if (this.lastAnchor) {
        this.position(this.lastAnchor);
      }
    }, 30);

    // 自动聚焦搜索框
    setTimeout(() => {
      const input = this.el.querySelector(
        ".llm-at-menu-search-input"
      ) as HTMLInputElement | null;
      input?.focus();
    }, 50);
  }

  // --- 仅刷新内容区（不重建搜索栏，保持焦点） ---

  private refreshContent(): void {
    const oldContent = this.el.querySelector(".llm-at-menu-content");
    if (oldContent) oldContent.remove();

    this.contentEl = this.el.createDiv("llm-at-menu-content");

    switch (this.state) {
      case "main":
        this.renderMainContent();
        break;
      case "notes":
        this.renderNotesContent();
        break;
      case "folders":
        this.renderFoldersContent();
        break;
    }
  }

  // ==================== 底部搜索栏 ====================

  private renderBottomSearch(): void {
    const searchRow = this.el.createDiv("llm-at-menu-search-bar");
    const input = searchRow.createEl("input", {
      cls: "llm-at-menu-search-input",
      attr: { placeholder: "Search...", type: "text" },
    });
    const searchIcon = searchRow.createSpan("llm-at-menu-search-icon");
    searchIcon.innerHTML = Icons.pixsoSearch(18);
    if (this.searchQuery) {
      input.value = this.searchQuery;
    }

    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.selectedIndex = 0;
      this.refreshContent();
    });
  }

  // ==================== 主菜单内容 ====================

  private renderMainContent(): void {
    const q = this.searchQuery.trim();

    if (q) {
      // 有搜索词 → 显示合并搜索结果
      this.renderSearchResults(this.contentEl);
    } else {
      // 无搜索词 → 显示 3 个菜单项
      this.renderMainItems(this.contentEl);
    }
  }

  private renderMainItems(parent: HTMLElement): void {
    this.selectedIndex = 0;

    const items: { type: AtRefType; icon: string; label: string }[] = [
      { type: "note", icon: Icons.assetNote(16), label: this.str("atMenuNote") },
      { type: "folder", icon: Icons.folder(16), label: this.str("atMenuFolder") },
      { type: "url", icon: Icons.globe(16), label: this.str("atMenuUrl") },
    ];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = parent.createDiv("llm-at-menu-item");
      if (i === this.selectedIndex) row.addClass("selected");

      row.innerHTML = item.icon;
      row.createSpan({ text: item.label, cls: "llm-at-menu-label" });

      // 右侧箭头
      const arrow = row.createSpan("llm-at-menu-arrow");
      arrow.innerHTML = Icons.chevronRight(14);

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onMainItemClick(item.type);
      });

      row.addEventListener("mouseenter", () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
    }
  }

  private onMainItemClick(type: AtRefType): void {
    const stateMap: Record<AtRefType, AtMenuState> = {
      note: "notes",
      folder: "folders",
      url: "url",
    };
    this.state = stateMap[type];
    this.selectedIndex = 0;
    this.searchQuery = "";
    this.urlValue = "";
    this.render();
  }

  // ==================== 搜索 — 合并结果（主菜单使用） ====================

  private renderSearchResults(parent: HTMLElement): void {
    const results = this.getCombinedSearchResults();

    if (results.length === 0) {
      const empty = parent.createDiv("llm-at-menu-empty");
      empty.setText(this.str("atMenuNoResults"));
      return;
    }

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const row = parent.createDiv("llm-at-menu-item llm-at-menu-note-item");
      if (i === this.selectedIndex) row.addClass("selected");

      const iconSpan = row.createSpan("llm-at-menu-item-icon");
      iconSpan.innerHTML = item.type === "note" ? Icons.stickyNote(14) : Icons.folder(14);

      const textCol = row.createDiv("llm-at-menu-note-text");
      textCol.createDiv({ text: item.name, cls: "llm-at-menu-note-title" });
      textCol.createDiv({ text: item.path, cls: "llm-at-menu-note-path" });

      const idx = i;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectSearchResult(results[idx]);
      });

      row.addEventListener("mouseenter", () => {
        this.selectedIndex = idx;
        this.updateSelection();
      });
    }
  }

  private getCombinedSearchResults(): { type: "note" | "folder"; path: string; name: string; file?: TFile }[] {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return [];

    const results: { type: "note" | "folder"; path: string; name: string; file?: TFile }[] = [];

    for (const file of this.allNotes) {
      if (file.basename.toLowerCase().includes(q) || file.path.toLowerCase().includes(q)) {
        results.push({ type: "note", path: file.path, name: file.basename, file });
      }
    }

    for (const node of this.folderTree) {
      if (node.isFolder && (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q))) {
        results.push({ type: "folder", path: node.path, name: node.name });
      }
    }

    return results.slice(0, 30);
  }

  private selectSearchResult(item: { type: "note" | "folder"; path: string; name: string; file?: TFile }): void {
    if (item.type === "note" && item.file) {
      this.selectNote(item.file);
    } else if (item.type === "folder") {
      this.selectFolder(item.path, item.name);
    }
  }

  // ==================== 笔记面板 ====================

  private renderNotesContent(): void {
    // 返回按钮
    const backRow = this.contentEl.createDiv("llm-at-menu-back");
    backRow.innerHTML = Icons.chevronLeft(14);
    backRow.createSpan({ text: this.str("atMenuBack") });
    backRow.addEventListener("click", (e) => {
      e.stopPropagation();
      this.state = "main";
      this.searchQuery = "";
      this.render();
    });

    // 笔记列表
    this.selectedIndex = 0;
    const listEl = this.contentEl.createDiv("llm-at-menu-list");
    const filtered = this.getFilteredNotes();

    if (filtered.length === 0) {
      const empty = listEl.createDiv("llm-at-menu-empty");
      empty.setText(this.str("atMenuNoResults"));
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const file = filtered[i];
      const row = listEl.createDiv("llm-at-menu-item llm-at-menu-note-item");
      if (i === this.selectedIndex) row.addClass("selected");

      const iconSpan = row.createSpan("llm-at-menu-item-icon");
      iconSpan.innerHTML = Icons.assetNote(14);

      const textCol = row.createDiv("llm-at-menu-note-text");
      textCol.createDiv({ text: file.basename, cls: "llm-at-menu-note-title" });
      textCol.createDiv({ text: file.path, cls: "llm-at-menu-note-path" });

      const idx = i;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectNote(filtered[idx]);
      });

      row.addEventListener("mouseenter", () => {
        this.selectedIndex = idx;
        this.updateSelection();
      });
    }
  }

  private getFilteredNotes(): TFile[] {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.allNotes.slice(0, 30);
    return this.allNotes
      .filter((f) => f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .slice(0, 30);
  }

  private selectNote(file: TFile): void {
    const data: AtReferenceData = { type: "note", path: file.path, name: file.basename };
    this.insertInlineRef(data);
    this.onSelect(data);
    this.close();
  }

  // ==================== 文件夹面板 ====================

  private renderFoldersContent(): void {
    // 返回按钮
    const backRow = this.contentEl.createDiv("llm-at-menu-back");
    backRow.innerHTML = Icons.chevronLeft(14);
    backRow.createSpan({ text: this.str("atMenuBack") });
    backRow.addEventListener("click", (e) => {
      e.stopPropagation();
      this.state = "main";
      this.searchQuery = "";
      this.render();
    });

    // 文件夹列表
    this.selectedIndex = 0;
    const listEl = this.contentEl.createDiv("llm-at-menu-list");
    const filtered = this.getFilteredFolders();

    if (filtered.length === 0) {
      const empty = listEl.createDiv("llm-at-menu-empty");
      empty.setText(this.str("atMenuNoFolders"));
      return;
    }

    for (let i = 0; i < filtered.length; i++) {
      const node = filtered[i];
      const row = listEl.createDiv("llm-at-menu-item llm-at-menu-folder-item");
      if (i === this.selectedIndex) row.addClass("selected");
      row.style.paddingLeft = `${12 + node.indent * 16}px`;

      const iconSpan = row.createSpan("llm-at-menu-item-icon");
      iconSpan.innerHTML = node.isFolder ? Icons.folder(14) : Icons.doc(14);

      row.createSpan({ text: node.name, cls: "llm-at-menu-label" });

      const idx = i;
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        if (filtered[idx].isFolder) {
          this.selectFolder(filtered[idx].path, filtered[idx].name);
        }
      });

      row.addEventListener("mouseenter", () => {
        this.selectedIndex = idx;
        this.updateSelection();
      });
    }
  }

  private getFilteredFolders() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.folderTree;
    return this.folderTree.filter(
      (n) => n.isFolder && (n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    );
  }

  private buildFolderTree(): void {
    const root = this.app.vault.getRoot();
    const result: { path: string; name: string; indent: number; isFolder: boolean }[] = [];

    const walk = (folder: TFolder, indent: number, parentPath: string) => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          result.push({ path: child.path, name: child.name, indent, isFolder: true });
          walk(child, indent + 1, child.path);
        }
      }
    };

    walk(root, 0, "");
    this.folderTree = result;
  }

  private selectFolder(path: string, name: string): void {
    const data: AtReferenceData = { type: "folder", path, name };
    this.insertInlineRef(data);
    this.onSelect(data);
    this.close();
  }

  // ==================== URL 面板 ====================

  private renderUrlContent(): void {
    // 返回按钮
    const backRow = this.contentEl.createDiv("llm-at-menu-back");
    backRow.innerHTML = Icons.chevronLeft(14);
    backRow.createSpan({ text: this.str("atMenuBack") });
    backRow.addEventListener("click", (e) => {
      e.stopPropagation();
      this.state = "main";
      this.render();
    });

    // URL 输入区
    const inputRow = this.contentEl.createDiv("llm-at-menu-url-row");
    const urlInput = inputRow.createEl("input", {
      cls: "llm-at-menu-url-input",
      attr: { placeholder: "https://...", type: "text" },
    });
    if (this.urlValue) {
      urlInput.value = this.urlValue;
    }

    urlInput.addEventListener("input", () => {
      this.urlValue = urlInput.value;
    });

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.confirmUrl();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.state = "main";
        this.render();
      }
      e.stopPropagation();
    });

    const confirmBtn = inputRow.createEl("button", {
      cls: "llm-at-menu-url-confirm",
      text: this.str("atMenuConfirm"),
    });
    confirmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.confirmUrl();
    });

    // 自动聚焦 URL 输入框
    setTimeout(() => urlInput.focus(), 50);
  }

  private confirmUrl(): void {
    const url = this.urlValue.trim();
    if (!url) return;

    let fullUrl = url;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = "https://" + fullUrl;
    }

    const data: AtReferenceData = { type: "url", name: this.extractUrlName(fullUrl), url: fullUrl };
    this.insertInlineRef(data);
    this.onSelect(data);
    this.close();
  }

  private extractUrlName(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  // ==================== 键盘导航 ====================

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.state === "url") return; // URL 面板有自己的 handler

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedIndex++;
      this.clampSelection();
      this.updateSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex--;
      this.clampSelection();
      this.updateSelection();
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.confirmCurrentSelection();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (this.state === "main") {
        this.close();
      } else {
        this.state = "main";
        this.searchQuery = "";
        this.render();
      }
    }
  }

  private clampSelection(): void {
    let max = 0;
    if (this.state === "main") {
      if (this.searchQuery.trim()) {
        max = Math.max(0, this.getCombinedSearchResults().length - 1);
      } else {
        max = 2; // 3 个菜单项
      }
    } else if (this.state === "notes") {
      max = Math.max(0, this.getFilteredNotes().length - 1);
    } else if (this.state === "folders") {
      max = Math.max(0, this.getFilteredFolders().length - 1);
    }

    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (this.selectedIndex > max) this.selectedIndex = max;
  }

  private updateSelection(): void {
    const items = this.el.querySelectorAll(
      ".llm-at-menu-content .llm-at-menu-item"
    );
    items.forEach((el, i) => {
      if (i === this.selectedIndex) {
        el.classList.add("selected");
        el.scrollIntoView({ block: "nearest" });
      } else {
        el.classList.remove("selected");
      }
    });
  }

  private confirmCurrentSelection(): void {
    switch (this.state) {
      case "main": {
        if (this.searchQuery.trim()) {
          // 搜索模式下：选择搜索结果
          const results = this.getCombinedSearchResults();
          if (results.length > 0 && this.selectedIndex < results.length) {
            this.selectSearchResult(results[this.selectedIndex]);
          }
        } else {
          // 菜单模式：打开子面板
          const types: AtRefType[] = ["note", "folder", "url"];
          this.onMainItemClick(types[this.selectedIndex] || "note");
        }
        break;
      }
      case "notes": {
        const filtered = this.getFilteredNotes();
        if (filtered.length > 0 && this.selectedIndex < filtered.length) {
          this.selectNote(filtered[this.selectedIndex]);
        }
        break;
      }
      case "folders": {
        const filtered = this.getFilteredFolders();
        if (filtered.length > 0 && this.selectedIndex < filtered.length) {
          const node = filtered[this.selectedIndex];
          if (node.isFolder) {
            this.selectFolder(node.path, node.name);
          }
        }
        break;
      }
    }
  }

  // ==================== 内联文本插入 ====================

  private insertInlineRef(data: AtReferenceData): void {
    if (!this.inputEl) return;

    // 如果是 contentEditable div，不在 textarea 中插入文字，由 onSelect 回调处理内联 Chip
    if ((this.inputEl as any).isContentEditable) {
      return;
    }

    let refText = "";
    switch (data.type) {
      case "note":
        refText = `@${data.name}`;
        break;
      case "folder":
        refText = `@${data.name}/`;
        break;
      case "url":
        refText = `@${data.url}`;
        break;
    }

    const val = (this.inputEl as HTMLTextAreaElement).value;
    if (this.isFromAtSign) {
      const beforeAt = val.substring(0, this.cursorPos - 1);
      const afterAt = val.substring(this.cursorPos);
      (this.inputEl as HTMLTextAreaElement).value = beforeAt + refText + afterAt;
      const newPos = beforeAt.length + refText.length;
      (this.inputEl as HTMLTextAreaElement).setSelectionRange(newPos, newPos);
    } else {
      const before = val.substring(0, this.cursorPos);
      const after = val.substring(this.cursorPos);
      (this.inputEl as HTMLTextAreaElement).value = before + refText + after;
      const newPos = this.cursorPos + refText.length;
      (this.inputEl as HTMLTextAreaElement).setSelectionRange(newPos, newPos);
    }
    this.inputEl.focus();
  }
}
