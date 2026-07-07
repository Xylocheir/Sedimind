import { Plugin, WorkspaceLeaf, Notice } from "obsidian";
import { ChatView, CHAT_VIEW_TYPE } from "./src/chat/ChatView";
import { AiAssistantModal } from "./src/chat/AiAssistantModal";
import { ManualSedimentModal } from "./src/chat/ManualSedimentModal";
import { LLMChatSettings, DEFAULT_SETTINGS } from "./src/settings";
import { LLMChatSettingsTab } from "./src/SettingsTab";
import { t, Language } from "./src/i18n";
import { SelectionToolbar } from "./src/SelectionToolbar";
import { McpManager } from "./src/mcp/McpManager";
import { MemoryManager } from "./src/memory/MemoryManager";
import { SedimentManager } from "./src/sediment/SedimentManager";
import { SedimentIndicator } from "./src/sediment/status-bar/sediment-indicator";
import { setExternalTools } from "./src/tools/index";

export default class LLMChatPlugin extends Plugin {
  settings: LLMChatSettings;
  private chatView: ChatView | null = null;
  private ribbonIconEl: HTMLElement | null = null;
  private selectionToolbar: SelectionToolbar | null = null;
  private mcpManager: McpManager | null = null;
  private memoryManager: MemoryManager | null = null;
  private sedimentManager: SedimentManager | null = null;

  private get lang(): Language {
    return (this.settings.language as Language) || "zh";
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    // 初始化 MCP 管理器
    this.mcpManager = new McpManager(this.app);
    // 初始化记忆管理器
    this.memoryManager = new MemoryManager(this.app, this.settings);
    // 初始化沉积层（Phase 1：重力筛选 + L1 写入 + 索引 + 简报 + 状态栏）
    const sedimentStatusBar = this.addStatusBarItem();
    const sedimentIndicator = new SedimentIndicator(sedimentStatusBar);
    this.sedimentManager = new SedimentManager(this.app, sedimentIndicator, {
      folderName: this.settings.sedimentFolderName,
      deviceName: "default",
      isEnabled: () => this.settings.enableSediment,
      isBriefingEnabled: () => this.settings.enableSedimentBriefing,
    });

    // 注册视图
    this.registerView(CHAT_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
      this.chatView = new ChatView(
        leaf,
        this.settings,
        async () => { await this.saveSettings(); },
        async () => {
          await this.loadSettings();
          return this.settings;
        },
        async (s: LLMChatSettings) => {
          this.settings = s;
          await this.saveSettings();
        },
        this.mcpManager || undefined,
        this.memoryManager || undefined,
        this.sedimentManager || undefined
      );
      // 聊天视图惰性创建后，同步最新引用给划词工具栏（构造时它还不存在）
      if (this.selectionToolbar) this.selectionToolbar.setChatView(this.chatView);
      return this.chatView;
    });

    // 注册 Ribbon 图标
    this.ribbonIconEl = this.addRibbonIcon("bot", t("ribbonTooltip", this.lang), () => {
      this.activateView();
    });

    // 注册命令：打开对话面板
    this.addCommand({
      id: "open-llm-chat",
      name: t("cmdOpenChat", this.lang),
      callback: () => { this.activateView(); },
    });

    // 注册命令：新建对话
    this.addCommand({
      id: "new-chat",
      name: t("cmdNewChat", this.lang),
      callback: () => { this.chatView?.resetChat(); },
    });

    // 注册命令：引用选中文字
    this.addCommand({
      id: "edit-selection",
      name: t("cmdEditSelection", this.lang),
      editorCallback: async (editor, ctx) => {
        const selected = editor.getSelection();
        if (!selected) return;
        const chatView = await this.activateView();
        chatView?.setSelectionText(selected, "");
      },
    });

    // 注册命令：AI 摘要
    this.addCommand({
      id: "ai-summarize-active-note",
      name: t("cmdSummarize", this.lang),
      callback: async () => {
        const chatView = await this.activateView();
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          chatView?.setInputText(t("summarizePrompt", this.lang, { path: activeFile.path }));
        }
      },
    });

    // 注册命令：手动沉积（将外部内容一键沉积到本地沉积层）
    this.addCommand({
      id: "manual-sediment",
      name: t("cmdManualSediment", this.lang),
      callback: async () => {
        const modal = new ManualSedimentModal(this.app, this.sedimentManager);
        modal.open();
      },
    });

    // 注册命令：重建沉积层索引（从磁盘 Markdown 重建 sediment_index.json）
    this.addCommand({
      id: "rebuild-sediment-index",
      name: "重建沉积层索引",
      callback: async () => {
        if (!this.sedimentManager) return;
        await this.sedimentManager.rebuildIndex();
        new Notice("沉积层索引已重建");
      },
    });

    // 布局就绪后尝试生成今日地质简报（幂等）
    this.registerEvent(
      (this.app.workspace.on as any)("layout-ready", () => {
        this.sedimentManager?.tryGenerateBriefing();
      })
    );

    // 编辑器右键菜单
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) => {
          item.setTitle(t("cmdAiAssistant", this.lang))
            .setIcon("bot")
            .onClick(() => {
              const selected = editor.getSelection();
              const modal = new AiAssistantModal(this.app, this.settings, this.chatView || undefined, this.mcpManager || undefined, this.memoryManager || undefined);
              modal.open();
              if (selected && selected.trim()) {
                setTimeout(() => {
                  const inputEl = modal.getInputElement();
                  if (inputEl) {
                    inputEl.value = selected.trim() + "\n";
                    inputEl.focus();
                  }
                }, 150);
              }
            });
        });
      })
    );

    // 自动捕获编辑器选中文字
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf && this.chatView) {
          // 同步最新 ChatView 引用给划词工具栏（防止为 null 快照）
          if (this.selectionToolbar) this.selectionToolbar.setChatView(this.chatView);
          setTimeout(() => {
            const activeLeaf = this.app.workspace.activeLeaf;
            if (activeLeaf && activeLeaf.view instanceof ChatView) {
              (activeLeaf.view as ChatView).captureSelection();
            }
          }, 150);
        }
      })
    );

    // 注册设置（传入 mcpManager）
    this.addSettingTab(new LLMChatSettingsTab(
      this.app, this, this.settings,
      () => {
        if (this.chatView) this.chatView.updateSettings(this.settings);
        if (this.ribbonIconEl) this.ribbonIconEl.setAttr("aria-label", t("ribbonTooltip", this.lang));
      },
      async () => { await this.saveData(this.settings); },
      this.mcpManager || undefined,
      this.sedimentManager || undefined
    ));

    // 划词工具栏
    this.selectionToolbar = new SelectionToolbar(this.app, this.settings, this.chatView);
    this.selectionToolbar.init();

    // 启动时自动连接已启用的 MCP 服务器
    this.connectEnabledMcpServers();
  }

  onunload(): void {
    // 断开 MCP 连接
    if (this.mcpManager) {
      this.mcpManager.disconnectAll();
      this.mcpManager = null;
    }
    // 清理沉积层引用
    if (this.sedimentManager) {
      this.sedimentManager = null;
    }
    if (this.selectionToolbar) {
      this.selectionToolbar.destroy();
      this.selectionToolbar = null;
    }
    this.chatView = null;
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 启动时连接所有已启用的 MCP 服务器 */
  private async connectEnabledMcpServers(): Promise<void> {
    if (!this.mcpManager) return;

    for (const server of this.settings.mcpServers) {
      if (server.enabled) {
        try {
          const tools = await this.mcpManager.connectServer(server);
          console.log(`[LLMChat] MCP "${server.name}" connected with ${tools.length} tools`);
          // 更新外部工具定义
          setExternalTools(this.mcpManager.getAllMcpToolDefinitions());
        } catch (error) {
          console.warn(`[LLMChat] Failed to connect MCP "${server.name}":`, error);
        }
      }
    }
  }

  async activateView(): Promise<ChatView | null> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return existing[0].view as ChatView;
    }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
      return leaf.view as ChatView;
    }
    return null;
  }
}

