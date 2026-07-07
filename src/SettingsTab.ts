import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl } from "obsidian";
import { LLMChatSettings, ModelEntry, BUILTIN_MODELS, CustomProvider } from "./settings";
import { getAllPersonas, resolvePersonaPrompt } from "./personas";
import { OllamaProvider, OllamaModel } from "./llm/OllamaProvider";
import { LANGUAGE_LIST, Language, t } from "./i18n";
import { McpServerConfig } from "./mcp/McpTypes";
import { McpManager } from "./mcp/McpManager";
import { SedimentManager } from "./sediment/SedimentManager";
import { renderSelectionToolbarEditor } from "./toolbarConfig";
import { FEEDBACK_SUPABASE_URL, FEEDBACK_SUPABASE_KEY, FEEDBACK_TABLE } from "./feedbackConfig";

/** 设置页 Tab 定义 */
type SettingsTabId = "general" | "models" | "mcp" | "memory" | "hotkeys" | "feedback";

export class LLMChatSettingsTab extends PluginSettingTab {
  private settings: LLMChatSettings;
  private plugin: Plugin;
  private onSettingsChange: () => void;
  private saveData: () => Promise<void>;
  private ollamaModels: OllamaModel[] = [];
  private activeTab: SettingsTabId = "general";
  private mcpManager: McpManager | null = null;
  private sedimentManager: SedimentManager | null = null;

  private get lang(): Language {
    return (this.settings.language as Language) || "zh";
  }

  private str(key: string, params?: Record<string, string>): string {
    return t(key, this.lang, params);
  }

  constructor(
    app: App,
    plugin: Plugin,
    settings: LLMChatSettings,
    onSettingsChange: () => void,
    saveData: () => Promise<void>,
    mcpManager?: McpManager,
    sedimentManager?: SedimentManager
  ) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
    this.saveData = saveData;
    this.mcpManager = mcpManager || null;
    this.sedimentManager = sedimentManager || null;
  }

  getName(): string {
    return t("settingsTabName", this.lang);
  }

  setMcpManager(mcpManager: McpManager): void {
    this.mcpManager = mcpManager;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ====== 标题行 ======
    const titleRow = containerEl.createDiv("llm-chat-settings-title-row");
    titleRow.style.display = "flex";
    titleRow.style.justifyContent = "space-between";
    titleRow.style.alignItems = "center";
    titleRow.style.marginBottom = "12px";
    titleRow.createEl("h2", { text: this.str("settingsTitle") });
    titleRow.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      cls: "llm-chat-version-badge",
    });

    // ====== Tab 导航 ======
    const tabs: { id: SettingsTabId; key: string }[] = [
      { id: "general", key: "settingsTabGeneral" },
      { id: "models", key: "settingsTabModels" },
      { id: "mcp", key: "settingsTabMcp" },
      { id: "memory", key: "settingsTabMemory" },
      { id: "feedback", key: "settingsTabFeedback" },
    ];

    const tabBar = containerEl.createDiv("llm-chat-settings-tab-bar");
    tabBar.style.cssText = "display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--background-modifier-border);padding-bottom:8px;";

    for (const tab of tabs) {
      const btn = tabBar.createEl("button", { text: this.str(tab.key) });
      btn.style.cssText = "padding:6px 14px;border:1px solid transparent;background:transparent;border-radius:4px;cursor:pointer;font-size:13px;";
      if (tab.id === this.activeTab) {
        btn.style.cssText += "background:var(--interactive-accent);color:var(--text-on-accent);border-color:var(--interactive-accent);";
      }
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.display();
      });
    }

    // ====== Tab 内容区域 ======
    const contentEl = containerEl.createDiv("llm-chat-settings-content");

    switch (this.activeTab) {
      case "general":
        this.renderGeneralTab(contentEl);
        break;
      case "models":
        this.renderModelTable(contentEl);
        break;
      case "mcp":
        this.renderMcpTab(contentEl);
        break;
      case "memory":
        this.renderMemoryTab(contentEl);
        break;
      case "feedback":
        this.renderFeedbackTab(contentEl);
        break;
    }
  }

  // ====== 通用设置 Tab ======
  private renderGeneralTab(container: HTMLElement): void {
    // 界面语言
    container.createEl("h3", { text: this.str("settingsLangSection") });
    new Setting(container)
      .setName(this.str("settingsLangName"))
      .setDesc(this.str("settingsLangDesc"))
      .addDropdown((dropdown) => {
        for (const lang of LANGUAGE_LIST) {
          dropdown.addOption(lang.key, lang.nativeName);
        }
        return dropdown.setValue(this.settings.language).onChange(async (value) => {
          this.settings.language = value;
          await this.save();
          this.saveAndRefresh();
        });
      });

    // 系统提示词 / AI 智能体（预设人格）
    container.createEl("h3", { text: "系统提示词 / AI 智能体" });

    // 预设人格选择
    const personaSetting = new Setting(container)
      .setName("AI 智能体（预设人格）")
      .setDesc("选择预设角色作为默认系统提示词，下方文本框可继续编辑，也可保存为自定义人格。");
    const personaSelect = personaSetting.controlEl.createEl("select", { cls: "dropdown" });
    const repopulateGlobalPersona = () => {
      personaSelect.empty();
      personaSelect.createEl("option", { text: "默认（下方自定义提示词）", value: "" });
      for (const p of getAllPersonas(this.settings)) {
        personaSelect.createEl("option", { text: p.icon + " " + p.name, value: p.id });
      }
      personaSelect.value = this.settings.defaultPersonaId &&
        getAllPersonas(this.settings).some((p) => p.id === this.settings.defaultPersonaId)
        ? this.settings.defaultPersonaId : "";
    };
    repopulateGlobalPersona();
    personaSelect.addEventListener("change", () => {
      const id = personaSelect.value;
      const prompt = id ? resolvePersonaPrompt(id, this.settings) : null;
      if (prompt != null) {
        this.settings.systemPrompt = prompt;
        this.settings.defaultPersonaId = id;
      } else {
        this.settings.defaultPersonaId = "";
      }
      if (sysText) sysText.setValue(this.settings.systemPrompt);
      void this.save();
    });

    // 保存为自定义人格
    const saveSetting = new Setting(container)
      .setName("保存为自定义人格")
      .setDesc("将下方当前提示词保存为可复用的自定义人格。");
    const nameInput = saveSetting.controlEl.createEl("input", { type: "text", placeholder: "人格名称，如：我的写作助手" });
    nameInput.style.marginRight = "8px";
    saveSetting.controlEl.createEl("button", { text: "保存", cls: "mod-cta" }).addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) { new Notice("请输入人格名称"); return; }
      const id = "custom-" + Date.now().toString(36);
      this.settings.personas.push({ id, name, icon: "⭐", description: name, systemPrompt: this.settings.systemPrompt });
      this.settings.defaultPersonaId = id;
      void this.save();
      repopulateGlobalPersona();
      personaSelect.value = id;
      new Notice("已保存自定义人格：" + name);
    });

    let sysText: any = null;
    new Setting(container)
      .setName(this.str("settingsSystemPrompt"))
      .setDesc(this.str("settingsSystemPromptDesc"))
      .addTextArea((text) => {
        text.setPlaceholder(this.str("settingsSystemPromptPlaceholder"))
          .setValue(this.settings.systemPrompt)
          .onChange(async (v) => { this.settings.systemPrompt = v; this.settings.defaultPersonaId = ""; await this.save(); });
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
        sysText = text;
      });

    // 划词工具栏：总开关
    container.createEl("h3", { text: "划词工具栏" });
    new Setting(container)
      .setName("启用划词工具栏")
      .setDesc("在笔记中选中文字时，在选区附近显示浮动工具栏。关闭后彻底不显示。")
      .addToggle((t) =>
        t.setValue(this.settings.enableSelectionToolbar)
          .onChange(async (v) => { this.settings.enableSelectionToolbar = v; await this.save(); })
      );

    // 划词工具栏：可编辑按钮（两栏编辑器 + 实时预览）
    new Setting(container)
      .setName("自定义划词工具栏")
      .setDesc("主栏按钮可勾选显示并拖拽排序；文本工具子菜单可勾选添加格式项并排序。修改即时保存。");
    renderSelectionToolbarEditor({ container, settings: this.settings, save: () => this.save() });

    // 快捷键（由独立标签页移入）
    container.createEl("h3", { text: this.str("settingsKeyboardSection") });
    container.createEl("p", { text: this.str("settingsKeyboardDesc"), cls: "setting-item-description" });
    const hotkeyCommands = [
      { id: "open-llm-chat", key: "cmdOpenChat", desc: "打开对话面板并自动捕获选中文字" },
      { id: "new-chat", key: "cmdNewChat", desc: "在对话面板中新建一个空白标签页" },
      { id: "edit-selection", key: "cmdEditSelection", desc: "引用编辑器中选中的文字，自动填入修改指令" },
      { id: "ai-summarize-active-note", key: "cmdSummarize", desc: "自动摘要当前活动笔记内容" },
    ];
    const cmdList = container.createDiv("llm-chat-hotkey-list");
    cmdList.style.marginTop = "8px";
    for (const cmd of hotkeyCommands) {
      const row = cmdList.createDiv("llm-chat-hotkey-row");
      row.style.cssText = "display:flex;align-items:center;padding:4px 0;gap:12px;";
      const idEl = row.createSpan();
      idEl.style.cssText = "font-family:monospace;font-size:12px;background:var(--background-modifier-border);padding:2px 6px;border-radius:4px;min-width:120px;text-align:center;";
      idEl.setText(cmd.id);
      const nameEl = row.createSpan({ text: this.str(cmd.key) });
      nameEl.style.flex = "1";
      const descEl = row.createSpan({ text: cmd.desc });
      descEl.style.cssText = "font-size:11px;color:var(--text-muted);";
    }
    const note = container.createEl("p", { text: this.str("settingsKeyboardNote"), cls: "setting-item-description" });
    note.style.marginTop = "8px";

  }

  // ====== 模型表格 Tab ======
  private renderModelTable(container: HTMLElement): void {
    container.createEl("h3", { text: this.str("settingsModelTableTitle") });
    container.createEl("p", { text: this.str("settingsModelTableDesc"), cls: "setting-item-description" });

    // 合并内置模型和自定义模型
    const allModels = [...BUILTIN_MODELS, ...this.settings.customModels];

    // 表格头部
    const table = container.createEl("table", { cls: "llm-chat-model-table" });
    table.style.cssText = "width:100%;border-collapse:collapse;margin-top:12px;";

    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    const headers = ["Model", "Provider", this.str("settingsModelCapabilities"), this.str("settingsModelBaseUrl"), this.str("settingsModelEnable"), ""];
    for (const h of headers) {
      const th = headerRow.createEl("th", { text: h });
      th.style.cssText = "text-align:left;padding:8px 6px;border-bottom:2px solid var(--background-modifier-border);font-size:12px;font-weight:600;";
    }

    const tbody = table.createEl("tbody");

    const renderRows = () => {
      tbody.empty();
      const current = [...BUILTIN_MODELS, ...this.settings.customModels];

      for (const model of current) {
        const row = tbody.createEl("tr");
        row.style.cssText = "border-bottom:1px solid var(--background-modifier-border);";

        // Name
        const nameCell = row.createEl("td");
        nameCell.style.cssText = "padding:6px;font-family:monospace;font-size:12px;";
        if (model.isBuiltin) {
          nameCell.setText(model.name);
        } else {
          const input = nameCell.createEl("input", { type: "text", value: model.name });
          input.style.cssText = "width:100%;";
          input.addEventListener("change", async () => {
            model.name = input.value;
            await this.save();
          });
        }

        // Provider
        const providerCell = row.createEl("td");
        providerCell.style.padding = "6px";
        if (model.isBuiltin) {
          providerCell.setText(model.provider);
        } else {
          const sel = providerCell.createEl("select");
          ["openai", "ollama", "anthropic", "deepseek", "claude-code", "codex", "gemini"].forEach((p) => {
            sel.createEl("option", { text: p, value: p });
          });
          // 自定义 API 供应商
          for (const cp of this.settings.customProviders) {
            sel.createEl("option", { text: cp.name, value: cp.id });
          }
          sel.value = model.provider;
          sel.addEventListener("change", async () => {
            model.provider = sel.value;
            await this.save();
            renderRows();
          });
        }

        // Capabilities
        const capCell = row.createEl("td");
        capCell.style.cssText = "padding:6px;font-size:11px;";
        const caps: string[] = [];
        if (model.capabilities.vision) caps.push("👁 Vision");
        if (model.capabilities.reasoning) caps.push("🧠 Reasoning");
        capCell.setText(caps.join(" ") || "—");

        // Base URL
        const urlCell = row.createEl("td");
        urlCell.style.cssText = "padding:6px;font-size:11px;color:var(--text-muted);";
        let modelUrl = model.baseUrl || "—";
        if (model.provider.startsWith("cp_")) {
          const cp = this.settings.customProviders.find((c) => c.id === model.provider);
          if (cp) modelUrl = cp.baseUrl || "—";
        }
        urlCell.setText(modelUrl);

        // Enable toggle
        const enableCell = row.createEl("td");
        enableCell.style.padding = "6px";
        const toggleWrapper = enableCell.createDiv({ cls: "checkbox-container" });
        const toggleInput = toggleWrapper.createEl("input", { type: "checkbox" });
        toggleInput.checked = model.enabled;
        toggleInput.addEventListener("change", async () => {
          model.enabled = toggleInput.checked;
          await this.save();
        });

        // Delete (only for custom models)
        const actionCell = row.createEl("td");
        actionCell.style.padding = "6px";
        if (!model.isBuiltin) {
          const delBtn = actionCell.createEl("button", { text: "✕", cls: "mod-warning" });
          delBtn.style.cssText = "padding:2px 8px;font-size:11px;";
          delBtn.addEventListener("click", async () => {
            this.settings.customModels = this.settings.customModels.filter((m) => m.id !== model.id);
            await this.save();
            renderRows();
          });
        }
      }
    };

    renderRows();

    // 添加自定义模型按钮
    const addRow = container.createDiv();
    addRow.style.marginTop = "12px";
    const addBtn = addRow.createEl("button", { text: this.str("settingsAddModel"), cls: "mod-cta" });
    addBtn.addEventListener("click", async () => {
      const newModel: ModelEntry = {
        id: `custom_${Date.now()}`,
        name: "new-model",
        provider: "openai",
        capabilities: { vision: false, reasoning: false },
        enabled: true,
        isBuiltin: false,
      };
      this.settings.customModels.push(newModel);
      await this.save();
      renderRows();
    });

    // ====== 自定义 API 供应商 ======
    container.createEl("h3", { text: this.str("settingsCustomProvidersTitle") });
    container.createEl("p", {
      text: this.str("settingsCustomProvidersDesc"),
      cls: "setting-item-description",
    });

    const cpList = container.createDiv({ cls: "llm-cp-list" });
    const renderCpList = () => {
      cpList.empty();
      for (const cp of this.settings.customProviders) {
        const card = cpList.createDiv({ cls: "llm-cp-card" });

        const head = card.createDiv({ cls: "llm-cp-card-head" });
        head.createSpan({ text: cp.name, cls: "llm-cp-name" });
        const del = head.createEl("button", { text: "✕", cls: "mod-warning" });
        del.style.cssText = "padding:2px 8px;font-size:11px;";
        del.addEventListener("click", async () => {
          this.settings.customProviders = this.settings.customProviders.filter((c) => c.id !== cp.id);
          if (this.settings.customProviderModels[cp.id]) {
            delete this.settings.customProviderModels[cp.id];
          }
          // 若当前正使用该供应商，回退到 openai
          if (this.settings.provider === cp.id) {
            this.settings.provider = "openai";
          }
          await this.save();
          renderCpList();
        });

        this.addTextSetting(card, "settingsProviderName", "settingsProviderNameDesc", "My vLLM", cp.name, (v) => { cp.name = v; });
        this.addTextSetting(card, "settingsProviderBaseUrl", "settingsProviderBaseUrlDesc", "https://api.example.com/v1", cp.baseUrl, (v) => { cp.baseUrl = v; });
        this.addTextSetting(card, "settingsProviderApiKey", "settingsProviderApiKeyDesc", "sk-...（可留空）", cp.apiKey, (v) => { cp.apiKey = v; });
        this.addTextSetting(card, "settingsProviderDefaultModel", "settingsProviderDefaultModelDesc", "gpt-4o", cp.defaultModel, (v) => { cp.defaultModel = v; });
      }
    };
    renderCpList();

    const addCpRow = container.createDiv();
    addCpRow.style.marginTop = "10px";
    const addCpBtn = addCpRow.createEl("button", { text: this.str("settingsAddProvider"), cls: "mod-cta" });
    addCpBtn.addEventListener("click", async () => {
      const cp: CustomProvider = {
        id: `cp_${Date.now()}`,
        name: this.str("settingsNewProvider"),
        baseUrl: "",
        apiKey: "",
        defaultModel: "",
      };
      this.settings.customProviders.push(cp);
      await this.save();
      renderCpList();
    });

    // 保存按钮：显式持久化自定义供应商
    const saveCpRow = container.createDiv();
    saveCpRow.style.marginTop = "8px";
    const saveCpBtn = saveCpRow.createEl("button", { text: this.str("settingsSaveProvider"), cls: "mod-cta" });
    saveCpBtn.addEventListener("click", async () => {
      await this.save();
      new Notice(this.str("settingsCustomProvidersSaved"));
    });

    // ====== 提供商配置（从「通用」移入）======
    container.createEl("h3", { text: "提供商配置" });

    container.createEl("h3", { text: this.str("settingsOpenAI") });
    this.addTextSetting(container, "settingsApiKey", "settingsOpenAIKeyDesc", "sk-...", this.settings.openaiApiKey, (v) => this.settings.openaiApiKey = v);
    this.addTextSetting(container, "settingsBaseUrl", "settingsOpenAIBaseUrlDesc", "https://api.openai.com/v1", this.settings.openaiBaseUrl, (v) => this.settings.openaiBaseUrl = v);
    this.addTextSetting(container, "settingsModel", "settingsOpenAIModelDesc", "gpt-4o", this.settings.openaiModel, (v) => this.settings.openaiModel = v);

    container.createEl("h3", { text: this.str("settingsOllama") });
    this.addTextSetting(container, "settingsOllamaUrl", "settingsOllamaUrlDesc", "http://localhost:11434", this.settings.ollamaBaseUrl, (v) => this.settings.ollamaBaseUrl = v);
    this.renderOllamaModelPicker(container);

    container.createEl("h3", { text: this.str("settingsAnthropic") });
    this.addTextSetting(container, "settingsApiKey", "settingsAnthropicKeyDesc", "sk-ant-...", this.settings.anthropicApiKey, (v) => this.settings.anthropicApiKey = v);
    this.addTextSetting(container, "settingsModel", "settingsAnthropicModelDesc", "claude-3-5-sonnet-20241022", this.settings.anthropicModel, (v) => this.settings.anthropicModel = v);

    container.createEl("h3", { text: this.str("settingsDeepSeek") });
    this.addTextSetting(container, "settingsApiKey", "settingsDeepSeekKeyDesc", "sk-...", this.settings.deepseekApiKey, (v) => this.settings.deepseekApiKey = v);
    this.addTextSetting(container, "settingsModel", "settingsDeepSeekModelDesc", "deepseek-v4-pro", this.settings.deepseekModel, (v) => this.settings.deepseekModel = v);

    container.createEl("h3", { text: this.str("settingsClaudeCode") });
    this.addTextSetting(container, "settingsBaseUrl", "settingsClaudeCodeBaseUrlDesc", "http://localhost:8080", this.settings.claudeCodeBaseUrl, (v) => this.settings.claudeCodeBaseUrl = v);
    this.addTextSetting(container, "settingsModel", "settingsClaudeCodeModelDesc", "claude-code-cli", this.settings.claudeCodeModel, (v) => this.settings.claudeCodeModel = v);
    new Setting(container)
      .setName("Claude Code CLI 可执行文件")
      .setDesc("claude 命令路径，默认 claude（需在 PATH 中）。可填绝对路径，如 C:/Users/xxx/.claude/claude.exe")
      .addText((t) => t.setPlaceholder("claude").setValue(this.settings.claudeCodeExecutable).onChange(async (v) => { this.settings.claudeCodeExecutable = v.trim() || "claude"; await this.save(); }));

    container.createEl("h3", { text: this.str("settingsCodex") });
    this.addTextSetting(container, "settingsBaseUrl", "settingsCodexBaseUrlDesc", "http://localhost:8080", this.settings.codexBaseUrl, (v) => this.settings.codexBaseUrl = v);
    this.addTextSetting(container, "settingsModel", "settingsCodexModelDesc", "codex-cli", this.settings.codexModel, (v) => this.settings.codexModel = v);
    new Setting(container)
      .setName("Codex CLI 可执行文件")
      .setDesc("codex 命令路径，默认 codex（需在 PATH 中）。可填绝对路径")
      .addText((t) => t.setPlaceholder("codex").setValue(this.settings.codexExecutable).onChange(async (v) => { this.settings.codexExecutable = v.trim() || "codex"; await this.save(); }));

    container.createEl("h3", { text: this.str("settingsGemini") });
    this.addTextSetting(container, "settingsApiKey", "settingsGeminiKeyDesc", "AIzaSy...", this.settings.geminiApiKey, (v) => this.settings.geminiApiKey = v);
    this.addTextSetting(container, "settingsModel", "settingsGeminiModelDesc", "gemini-1.5-flash", this.settings.geminiModel, (v) => this.settings.geminiModel = v);

    // 通用模型参数
    container.createEl("h3", { text: this.str("settingsGeneral") });
    new Setting(container).setName(this.str("settingsMaxTokens")).setDesc(this.str("settingsMaxTokensDesc"))
      .addSlider((s) => s.setLimits(256, 32768, 256).setValue(this.settings.maxTokens).setDynamicTooltip().onChange(async (v) => { this.settings.maxTokens = v; await this.save(); }));
    new Setting(container).setName(this.str("settingsTemperature")).setDesc(this.str("settingsTemperatureDesc"))
      .addSlider((s) => s.setLimits(0, 2, 0.1).setValue(this.settings.temperature).setDynamicTooltip().onChange(async (v) => { this.settings.temperature = v; await this.save(); }));
    new Setting(container).setName(this.str("settingsHistoryLength")).setDesc(this.str("settingsHistoryLengthDesc"))
      .addSlider((s) => s.setLimits(10, 200, 10).setValue(this.settings.maxConversationHistory).setDynamicTooltip().onChange(async (v) => { this.settings.maxConversationHistory = v; await this.save(); }));
    new Setting(container)
      .setName(this.str("settingsEnable1MContext"))
      .setDesc(this.str("settingsEnable1MContextDesc"))
      .addToggle((t) => t.setValue(this.settings.enable1MContext).onChange(async (v) => { this.settings.enable1MContext = v; await this.save(); this.onSettingsChange(); }));
  }

  // ====== MCP 管理 Tab ======
  private renderMcpTab(container: HTMLElement): void {
    container.createEl("h3", { text: this.str("settingsMcpTitle") });
    container.createEl("p", { text: this.str("settingsMcpDesc"), cls: "setting-item-description" });

    if (typeof navigator !== "undefined" && /android|iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())) {
      const mobileWarning = container.createDiv("llm-chat-mobile-warning");
      mobileWarning.style.cssText = "padding:10px 12px;border-radius:6px;background:var(--background-modifier-warning);color:var(--text-warning);font-size:13px;margin-top:8px;margin-bottom:12px;";
      mobileWarning.setText("⚠️ MCP 功能在移动设备上不可用");
    }

    // 已有的 MCP 服务器列表
    const serverList = container.createDiv();
    serverList.style.marginTop = "12px";

    const renderServers = () => {
      serverList.empty();

      for (const server of this.settings.mcpServers) {
        const card = serverList.createDiv("llm-chat-mcp-card");
        card.style.cssText = "border:1px solid var(--background-modifier-border);border-radius:6px;padding:12px;margin-bottom:8px;";

        // 头部
        const header = card.createDiv();
        header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;";

        const nameInput = header.createEl("input", { type: "text", value: server.name });
        nameInput.style.cssText = "font-weight:600;font-size:14px;border:none;background:transparent;flex:1;";
        nameInput.addEventListener("change", async () => {
          server.name = nameInput.value;
          await this.save();
        });

        // 启用/禁用
        const toggleDiv = header.createDiv({ cls: "checkbox-container" });
        const toggleInput = toggleDiv.createEl("input", { type: "checkbox" });
        toggleInput.checked = server.enabled;
        toggleInput.addEventListener("change", async () => {
          server.enabled = toggleInput.checked;
          if (server.enabled && this.mcpManager) {
            try {
              await this.mcpManager.connectServer(server);
            } catch {
              // connection failed
            }
          } else if (!server.enabled && this.mcpManager) {
            await this.mcpManager.disconnectServer(server.id);
          }
          await this.save();
        });

        // 删除
        const delBtn = header.createEl("button", { text: "删除" });
        delBtn.addEventListener("click", async () => {
          if (this.mcpManager) {
            await this.mcpManager.disconnectServer(server.id);
          }
          this.settings.mcpServers = this.settings.mcpServers.filter((s) => s.id !== server.id);
          await this.save();
          renderServers();
        });

        // 配置行
        const configRow = card.createDiv();
        configRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

        // 传输类型
        const transportSel = configRow.createEl("select");
        transportSel.style.flex = "0 0 100px";
        transportSel.createEl("option", { text: "stdio", value: "stdio" });
        transportSel.createEl("option", { text: "HTTP", value: "http" });
        transportSel.value = server.transport;
        transportSel.addEventListener("change", async () => {
          server.transport = transportSel.value as "stdio" | "http";
          await this.save();
        });

        if (server.transport === "stdio") {
          const cmdInput = configRow.createEl("input", { type: "text", placeholder: "命令路径，如 npx", value: server.command || "" });
          cmdInput.style.flex = "1";
          cmdInput.addEventListener("change", async () => {
            server.command = cmdInput.value;
            await this.save();
          });

          const argsInput = configRow.createEl("input", { type: "text", placeholder: "参数，如 -y @anthropic/mcp-server-pixso", value: (server.args || []).join(" ") });
          argsInput.style.flex = "2";
          argsInput.addEventListener("change", async () => {
            server.args = argsInput.value.split(" ").filter(Boolean);
            await this.save();
          });
        } else {
          const urlInput = configRow.createEl("input", { type: "text", placeholder: "http://localhost:3000/mcp", value: server.url || "" });
          urlInput.style.flex = "1";
          urlInput.addEventListener("change", async () => {
            server.url = urlInput.value;
            await this.save();
          });
        }

        // 状态和工具数
        const stateText = card.createEl("span", {
          text: this.mcpManager
            ? `状态: ${this.mcpManager.getConnectionInfos().find((c) => c.config.id === server.id)?.state || "未连接"} | 工具数: ${this.mcpManager.getConnectionInfos().find((c) => c.config.id === server.id)?.tools.length || 0}`
            : "未连接",
          cls: "setting-item-description",
        });
        stateText.style.marginTop = "8px";
        stateText.style.display = "block";
      }
    };

    renderServers();

    // 添加 MCP 服务器按钮
    const addBtn = container.createEl("button", {
      text: this.str("settingsMcpAddServer"),
      cls: "mod-cta",
    });
    addBtn.style.marginTop = "12px";
    addBtn.addEventListener("click", async () => {
      const newServer: McpServerConfig = {
        id: `mcp_${Date.now()}`,
        name: "新 MCP 服务器",
        enabled: false,
        transport: "stdio",
        command: "",
        args: [],
      };
      this.settings.mcpServers.push(newServer);
      await this.save();
      renderServers();
    });
  }

  // ====== 记忆系统 Tab ======
  private renderMemoryTab(container: HTMLElement): void {
    container.createEl("h3", { text: this.str("settingsMemoryTitle") });
    container.createEl("p", { text: this.str("settingsMemoryDesc"), cls: "setting-item-description" });

    // 近期对话记忆
    new Setting(container)
      .setName(this.str("settingsEnableRecentConversations"))
      .setDesc(this.str("settingsEnableRecentConversationsDesc"))
      .addToggle((t) =>
        t.setValue(this.settings.enableRecentConversations)
          .onChange(async (v) => { this.settings.enableRecentConversations = v; await this.save(); })
      );

    new Setting(container)
      .setName(this.str("settingsMaxRecentConversations"))
      .setDesc(this.str("settingsMaxRecentConversationsDesc"))
      .addSlider((s) =>
        s.setLimits(1, 20, 1)
          .setValue(this.settings.maxRecentConversations)
          .setDynamicTooltip()
          .onChange(async (v) => { this.settings.maxRecentConversations = v; await this.save(); })
      );

    // 保存记忆
    new Setting(container)
      .setName(this.str("settingsEnableSavedMemory"))
      .setDesc(this.str("settingsEnableSavedMemoryDesc"))
      .addToggle((t) =>
        t.setValue(this.settings.enableSavedMemory)
          .onChange(async (v) => { this.settings.enableSavedMemory = v; await this.save(); })
      );

    new Setting(container)
      .setName(this.str("settingsMemoryFolderName"))
      .setDesc(this.str("settingsMemoryFolderNameDesc"))
      .addText((t) =>
        t.setPlaceholder("llm-chat/memory")
          .setValue(this.settings.memoryFolderName)
          .onChange(async (v) => { this.settings.memoryFolderName = v; await this.save(); })
      );

    // ====== 沉积层（Phase 1）======
    // 与记忆系统平行：记忆存成品，沉积层被动沉淀对话内容（L1）
    let briefingSetting: Setting | null = null;
    new Setting(container)
      .setName("沉积层")
      .setDesc("总开关：开启后，每轮对话的用户消息与 AI 回复会经重力筛选后沉积到本地（.sediment/L1），不污染对话；关闭则停止一切沉积、简报与状态栏。")
      .addToggle((t) =>
        t.setValue(this.settings.enableSediment)
          .onChange(async (v) => {
            this.settings.enableSediment = v;
            await this.save();
            this.sedimentManager?.updateIndicatorVisibility();
            if (briefingSetting) briefingSetting.setDisabled(!v);
          })
      );

    briefingSetting = new Setting(container)
      .setName("每日简报")
      .setDesc("子开关：开启后 Obsidian 启动（布局就绪）时生成当日沉积层日报。需先开启上方「沉积层」总开关。")
      .addToggle((t) =>
        t.setValue(this.settings.enableSedimentBriefing)
          .setDisabled(!this.settings.enableSediment)
          .onChange(async (v) => { this.settings.enableSedimentBriefing = v; await this.save(); })
      );

    new Setting(container)
      .setName("沉积层文件夹")
      .setDesc("沉积物存放根目录（相对于 vault 根目录）。默认 .sediment。")
      .addText((t) =>
        t.setPlaceholder(".sediment")
          .setValue(this.settings.sedimentFolderName)
          .onChange(async (v) => { this.settings.sedimentFolderName = v; await this.save(); })
      );
  }

  // ====== 快捷键 Tab ======

  // ====== 问题反馈 Tab ======
  private renderFeedbackTab(container: HTMLElement): void {
    container.createEl("h3", { text: this.str("feedbackTitle") });
    container.createEl("p", { text: this.str("feedbackDesc"), cls: "setting-item-description" });

    const feedbackForm = container.createDiv("llm-chat-feedback-form");
    feedbackForm.style.cssText = "margin-top:16px;";

    // 可选联系邮箱（仅作开发者回复用；不会出现在任何公开场景）
    const emailSetting = new Setting(feedbackForm)
      .setName(this.str("feedbackEmailLabel"))
      .setDesc(this.str("feedbackEmailOptionalHint"));
    let feedbackEmail = "";
    emailSetting.addText((field) => {
      field.setPlaceholder(this.str("feedbackEmailPlaceholder"));
      field.inputEl.type = "email";
      field.inputEl.style.width = "100%";
      field.onChange((v) => {
        feedbackEmail = v.trim();
      });
    });

    new Setting(feedbackForm)
      .setName(this.str("feedbackType"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("bug", this.str("feedbackTypeBug"))
          .addOption("feature", this.str("feedbackTypeFeature"))
          .addOption("other", this.str("feedbackTypeOther"))
          .setValue("bug")
      );

    new Setting(feedbackForm)
      .setName(this.str("feedbackContent"))
      .addTextArea((text) => {
        text.setPlaceholder(this.str("feedbackContentPlaceholder"));
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
      });

    const imageUploadSetting = new Setting(feedbackForm)
      .setName(this.str("feedbackAttachImages"))
      .setDesc(this.str("feedbackAttachImagesDesc"));

    const imageContainer = imageUploadSetting.controlEl.createDiv("llm-chat-feedback-images");
    imageContainer.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;";

    const uploadedImages: HTMLElement[] = [];
    const uploadedImageData: string[] = [];

    const addImageBtn = imageContainer.createEl("button", {
      text: "+ " + this.str("feedbackAttachImages"),
      cls: "mod-cta",
    });
    addImageBtn.style.cssText = "padding:4px 12px;font-size:12px;height:auto;";

    addImageBtn.addEventListener("click", () => {
      if (uploadedImages.length >= 5) {
        return;
      }

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";
      input.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          const file = target.files[0];
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            uploadedImageData.push(dataUrl);

            const imageWrapper = imageContainer.createDiv("llm-chat-feedback-image-wrapper");
            imageWrapper.style.cssText = "position:relative;width:100px;height:100px;border-radius:4px;overflow:hidden;border:1px solid var(--background-modifier-border);";

            const img = imageWrapper.createEl("img", { attr: { src: dataUrl } });
            img.style.cssText = "width:100%;height:100%;object-fit:cover;";

            const removeBtn = imageWrapper.createEl("button", {
              text: this.str("feedbackImageRemove"),
              cls: "llm-chat-feedback-image-remove",
            });
            removeBtn.style.cssText = "position:absolute;top:0;right:0;background:rgba(0,0,0,0.7);color:white;font-size:10px;padding:2px 6px;border:none;border-radius:0 4px 0 4px;cursor:pointer;";

            removeBtn.addEventListener("click", () => {
              const idx = uploadedImages.indexOf(imageWrapper);
              if (idx > -1) {
                uploadedImages.splice(idx, 1);
                uploadedImageData.splice(idx, 1);
              }
              imageWrapper.remove();
              addImageBtn.style.display = uploadedImages.length < 5 ? "block" : "none";
            });

            uploadedImages.push(imageWrapper);
            addImageBtn.style.display = uploadedImages.length < 5 ? "block" : "none";
          };
          reader.readAsDataURL(file);
        }
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });

    const submitBtnRow = feedbackForm.createDiv();
    submitBtnRow.style.cssText = "display:flex;justify-content:flex-end;margin-top:12px;";
    const submitBtn = submitBtnRow.createEl("button", {
      text: this.str("feedbackSubmit"),
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", async () => {
      const feedbackTypeSelect = feedbackForm.querySelector("select") as HTMLSelectElement;
      const feedbackContentTextarea = feedbackForm.querySelector("textarea") as HTMLTextAreaElement;
      const feedbackEmailInput = feedbackForm.querySelector('input[type="email"]') as HTMLInputElement | null;

      const feedbackType = feedbackTypeSelect?.value || "bug";
      const feedbackContent = (feedbackContentTextarea?.value || "").trim();

      if (!feedbackContent) {
        new Notice(this.str("feedbackContentPlaceholder"));
        return;
      }

      // 邮箱可选：填写时做基础格式校验，避免误填被原样入库
      let emailToSend: string | null = null;
      if (feedbackEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail)) {
          new Notice(this.str("feedbackEmailInvalid"));
          return;
        }
        emailToSend = feedbackEmail;
      }

      const payload = {
        type: feedbackType,
        content: feedbackContent,
        email: emailToSend,
        images: uploadedImageData,
        app_version: this.plugin.manifest.version,
        lang: this.settings.language,
        created_at: new Date().toISOString(),
      };

      const prevText = submitBtn.getText();
      submitBtn.disabled = true;
      submitBtn.setText(this.str("feedbackSubmitting"));

      try {
        const resp = await requestUrl({
          url: `${FEEDBACK_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${FEEDBACK_TABLE}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: FEEDBACK_SUPABASE_KEY,
            Authorization: `Bearer ${FEEDBACK_SUPABASE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(payload),
        });
        if (resp.status < 200 || resp.status >= 300) {
          throw new Error(`HTTP ${resp.status}`);
        }
        submitBtn.setText(this.str("feedbackSuccess"));
        new Notice(this.str("feedbackSuccess"));
        if (feedbackContentTextarea) feedbackContentTextarea.value = "";
        feedbackEmail = "";
        if (feedbackEmailInput) feedbackEmailInput.value = "";
      } catch (err) {
        console.error("反馈提交失败", err);
        new Notice(this.str("feedbackSubmitFailed") + (err instanceof Error ? err.message : String(err)));
      } finally {
        setTimeout(() => {
          submitBtn.setText(prevText);
          submitBtn.disabled = false;
        }, 3000);
      }
    });

    const sponsorSection = container.createDiv("llm-chat-sponsor-section");

    const titleRow = sponsorSection.createDiv();
    titleRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
    titleRow.createEl("span", { text: "☕", cls: "llm-chat-sponsor-icon" });
    titleRow.createEl("h3", { text: this.str("sponsorTitle") });

    sponsorSection.createEl("p", {
      text: this.str("sponsorDesc"),
      cls: "setting-item-description",
    }).style.marginBottom = "12px";

    const sponsorBtn = sponsorSection.createEl("button", {
      text: this.str("sponsorButton"),
      cls: "llm-chat-sponsor-button mod-cta",
    });

    sponsorBtn.addEventListener("click", async () => {
      window.open(this.settings.sponsorUrl, "_blank");
      sponsorBtn.setText(this.str("sponsorThanks"));
      setTimeout(() => {
        sponsorBtn.setText(this.str("sponsorButton"));
      }, 3000);
    });
  }

  // ====== 辅助方法 ======

  private addTextSetting(
    container: HTMLElement,
    nameKey: string,
    descKey: string,
    placeholder: string,
    value: string,
    setter: (v: string) => void
  ): void {
    new Setting(container)
      .setName(this.str(nameKey))
      .setDesc(this.str(descKey))
      .addText((text) =>
        text.setPlaceholder(placeholder).setValue(value).onChange(async (v) => {
          setter(v);
          await this.save();
        })
      );
  }

  private renderOllamaModelPicker(container: HTMLElement): void {
    const modelSetting = new Setting(container)
      .setName(this.str("settingsModel"))
      .setDesc(this.str("settingsOllamaModelDesc"));

    const controlRow = modelSetting.controlEl.createDiv("ollama-model-row");
    controlRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

    const dropdown = controlRow.createEl("select", { cls: "dropdown" });
    dropdown.style.cssText = "flex:1;min-width:160px;";

    const customInput = controlRow.createEl("input", {
      type: "text",
      placeholder: this.str("settingsOllamaCustomPlaceholder"),
    });
    customInput.style.cssText = "flex:1;min-width:140px;";

    const refreshBtn = controlRow.createEl("button", {
      text: this.str("settingsRefreshModels"),
      cls: "mod-cta",
    });

    const loadModels = async (showNotice = false) => {
      refreshBtn.disabled = true;
      refreshBtn.setText(this.str("settingsLoadingModels"));
      try {
        this.ollamaModels = await OllamaProvider.fetchModels(this.settings.ollamaBaseUrl);
        dropdown.empty();
        dropdown.createEl("option", { text: this.str("settingsSelectModel"), value: "" });
        if (this.ollamaModels.length === 0) {
          dropdown.createEl("option", { text: this.str("settingsNoModels"), value: "", attr: { disabled: "true" } });
        } else {
          this.ollamaModels.forEach((m) => {
            dropdown.createEl("option", { text: `${m.name} (${this.formatSize(m.size)})`, value: m.name });
          });
        }
        const saved = this.settings.ollamaModel;
        if (saved && Array.from(dropdown.options).find((o: HTMLOptionElement) => o.value === saved)) {
          dropdown.value = saved;
        } else if (saved) {
          customInput.value = saved;
        }
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.setText(this.str("settingsRefreshModels"));
      }
    };

    refreshBtn.addEventListener("click", () => loadModels(true));
    dropdown.addEventListener("change", async () => {
      if (dropdown.value) {
        this.settings.ollamaModel = dropdown.value;
        customInput.value = "";
        await this.save();
      }
    });
    customInput.addEventListener("change", async () => {
      const val = customInput.value.trim();
      if (val) {
        this.settings.ollamaModel = val;
        await this.save();
      }
    });

    loadModels(false);
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} GB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private async save(): Promise<void> {
    await this.saveData();
  }

  private saveAndRefresh(): void {
    this.onSettingsChange();
    this.display();
  }
}
