import { App, Notice } from "obsidian";
import {
  ChatMessage,
  LLMProvider,
  OpenAIProvider,
  OllamaProvider,
  AnthropicProvider,
  DeepSeekProvider,
  ClaudeCodeProvider,
  CodexProvider,
  GeminiProvider,
  ToolDefinition,
} from "../llm/index";
import { getAllTools, executeToolCall, setExternalTools } from "../tools/index";
import { LLMChatSettings } from "../settings";
import { McpManager } from "../mcp/McpManager";
import { SedimentManager } from "../sediment/SedimentManager";
import { extractAndRoute } from "../sediment/capture-extractor";
import { MemoryManager } from "../memory/MemoryManager";

export interface UICallbacks {
  onUserMessage: (content: string) => void;
  onAssistantChunk: (content: string) => void;
  onAssistantMessage: (content: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string) => void;
  onError: (message: string) => void;
  onThinking: (thinking: boolean) => void;
}

export class MessageHandler {
  private app: App;
  private settings: LLMChatSettings;
  private messages: ChatMessage[] = [];
  private provider: LLMProvider;
  private ui: UICallbacks;
  private isProcessing = false;
  private cancelled = false;
  private customSystemPrompt: string | null = null;
  private abortController: AbortController | null = null;
  private mcpManager: McpManager | null = null;
  private memoryManager: MemoryManager | null = null;
  private sedimentManager: SedimentManager | null = null;
  private static sedimentWarnShown = false;

  constructor(
    app: App,
    settings: LLMChatSettings,
    ui: UICallbacks,
    customSystemPrompt?: string,
    mcpManager?: McpManager,
    memoryManager?: MemoryManager,
    sedimentManager?: SedimentManager
  ) {
    this.app = app;
    this.settings = settings;
    this.ui = ui;
    this.customSystemPrompt = customSystemPrompt || null;
    this.mcpManager = mcpManager || null;
    this.memoryManager = memoryManager || null;
    this.sedimentManager = sedimentManager || null;
    this.provider = this.createProvider();
    // 异步初始化系统消息（包含记忆上下文）
    this.initConversationWithMemory();
  }

  setMcpManager(mcpManager: McpManager): void {
    this.mcpManager = mcpManager;
  }

  setSedimentManager(sedimentManager: SedimentManager): void {
    this.sedimentManager = sedimentManager;
  }

  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
  }

  setCustomSystemPrompt(prompt: string | null): void {
    this.customSystemPrompt = prompt || null;
    void this.updateSystemPrompt();
  }

  cancel(): void {
    this.cancelled = true;
    this.abortController?.abort();
  }

  private createProvider(): LLMProvider {
    // 自定义 API 供应商（OpenAI 兼容端点）：以 cp_ 前缀识别
    if (this.settings.provider.startsWith("cp_")) {
      const cp = this.settings.customProviders.find((c) => c.id === this.settings.provider);
      if (cp) {
        const model =
          (this.settings.customProviderModels && this.settings.customProviderModels[cp.id]) ||
          cp.defaultModel;
        return new OpenAIProvider(this.settings, {
          baseUrl: cp.baseUrl,
          apiKey: cp.apiKey,
          model,
        });
      }
    }

    switch (this.settings.provider) {
      case "openai":
        return new OpenAIProvider(this.settings);
      case "ollama":
        return new OllamaProvider(this.settings);
      case "anthropic":
        return new AnthropicProvider(this.settings);
      case "deepseek":
        return new DeepSeekProvider(this.settings);
      case "claude-code":
        return new ClaudeCodeProvider(this.settings);
      case "codex":
        return new CodexProvider(this.settings);
      default:
        return new OpenAIProvider(this.settings);
    }
  }

  updateSettings(settings: LLMChatSettings): void {
    this.settings = settings;
    this.provider = this.createProvider();
    // 保留当前对话历史但更新 system prompt
    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.updateSystemPrompt();
    }
  }

  /** 异步初始化对话（加载记忆上下文后设置 system prompt） */
  private async initConversationWithMemory(): Promise<void> {
    this.messages = [];
    await this.updateSystemPrompt();
  }

  private async updateSystemPrompt(): Promise<void> {
    let prompt = this.customSystemPrompt || this.settings.systemPrompt;

    // 注入记忆上下文（意识层：近期日记 + 长期画像）
    if (this.memoryManager) {
      const memoryCtx = await this.memoryManager.getMemoryContext();
      if (memoryCtx) {
        prompt += memoryCtx;
      }
    }

    // 如果用户要求记住信息，添加记忆保存指令
    if (this.settings.enableMemory) {
if (this.settings.enableSediment && this.sedimentManager) {
      prompt +=
        `\n\n[沉积层协议] 在给出最终答案之前，请先用 <think> 标签写出你的思考过程，包括你考虑过的不同思路和放弃的理由。\n` +
        `格式：<think>思考内容</think>。这部分不会被用户看到，会被自动剥离并沉积。不要在工具调用中间回合输出 <think>，只在最终回答前输出。\n`;
      if (this.settings.enableSedimentAnalysis) {
        const ctx = this.sedimentManager.buildInjectionContext();
        if (ctx && ctx.blocks.length > 0) {
          const inj = ctx.blocks.map((b) => `- ${b.excerpt}`).join("\n");
          prompt +=
            `\n\n[沉积层反差注入] 以下为历史上高存活或相关的沉积片段，供你参考或刻意与之对照（它们可能已过时，请自行判断）：\n${inj}\n`;
        }
      }
    }


      prompt += `\n\n如果用户在对话中明确表示"记住..."、"帮我记下..."、"保存这个..."或类似意图，你应该调用 save_memory 工具来保存这条信息。`;
    }

    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.messages[0].content = prompt;
    } else {
      this.messages.unshift({ role: "system", content: prompt });
    }
  }

  resetConversation(): void {
    this.messages = [];
    this.updateSystemPrompt();
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  /** 从历史记录加载消息（替换当前消息列表） */
  loadMessages(messages: ChatMessage[]): void {
    this.messages = messages.map((m) => (m.id ? m : { ...m, id: "msg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8) }));
  }

  /** 追加一条消息到历史（不触发 AI 调用，用于外部同步） */
  appendMessage(role: ChatMessage["role"], content: string): void {
    this.messages.push({ role, content });
    this.trimHistory();
  }

  async sendMessage(userContent: string): Promise<void> {
    if (this.isProcessing) {
      new Notice("正在处理上一条消息，请稍候...");
      return;
    }

    if (!this.provider.isConfigured()) {
      this.ui.onError(
        `请先在设置中配置 ${this.provider.name} 的 API 密钥。`
      );
      return;
    }

    this.isProcessing = true;

    // create AbortController for cancel/timeout, 120s fallback
    const abortController = new AbortController();
    this.abortController = abortController;
    const timeout = setTimeout(() => abortController.abort(), 120_000);
    this.ui.onUserMessage(userContent);

    // 添加用户消息到历史
    this.messages.push({ role: "user", content: userContent });
    this.trimHistory();

    try {
      await this.runConversationLoop();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.ui.onError(`发生错误：${errMsg}`);
    } finally {
      this.isProcessing = false;
      this.ui.onThinking(false);
    }
  }

  private async runConversationLoop(): Promise<void> {
    // 上限可配置（学 Copilot Max Iterations），默认 10 兜底
    const maxIterations = this.settings.maxToolIterations || 10;

    let iteration = 0;
    let stoppedReason: string | null = null;

    const userText = this.messages.filter((m) => m.role === "user").pop()?.content || "";

    // 防死循环：重复调用检测 + 失败熔断（学 Claudian 错误自纠 / Copilot 工具开关）
    const callHistory: string[] = [];
    const failStreak: Record<string, number> = {};

    while (iteration < maxIterations) {
      iteration++;

      this.ui.onThinking(true);

      let fullResponse = "";

      // 使用 getAllTools() 合并内置工具 + MCP 外部工具
      const tools = getAllTools();
      const response = await this.provider.chat(
        this.messages,
        tools,
        (chunk) => {
          fullResponse = chunk;
          this.ui.onAssistantChunk(chunk);
        }
      );

      this.ui.onThinking(false);

      // 添加助手消息到历史
      this.messages.push(response);
      this.trimHistory();

      // 如果没有工具调用，结束循环
      if (!response.tool_calls || response.tool_calls.length === 0) {
        this.ui.onAssistantMessage(response.content);
        // 后台自动蒸馏本轮对话要点写入日记（fire-and-forget，不阻塞用户）
        void this.extractAndRoute(userText, response.content);
        return;
      }

      // 执行工具调用
      for (const toolCall of response.tool_calls) {
        const name = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        this.ui.onToolCall(name, args);

        // 重复调用检测：连续两次 name+args 完全一致视为无进展，提前停止
        const sig = name + "::" + JSON.stringify(args);
        if (callHistory.length && callHistory[callHistory.length - 1] === sig) {
          stoppedReason = `检测到工具「${name}」被反复调用且未产生进展，已提前停止以避免死循环。请检查该工具实现，或简化你的请求。`;
          break;
        }
        callHistory.push(sig);

        // 处理 save_memory 工具（记忆系统内置）
        if (name === "save_memory" && this.memoryManager) {
          const memoryContent = args.content as string || String(args);
          await this.memoryManager.saveMemory(memoryContent);
          const result = `已保存记忆：${memoryContent.slice(0, 50)}...`;
          this.ui.onToolResult(name, result);
          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
          this.trimHistory();
          continue;
        }

        // 路由内置工具或 MCP 工具
        const result = await executeToolCall(
          this.app,
          name,
          args,
          this.mcpManager
            ? (n, a) => this.mcpManager!.callMcpTool(n, a)
            : undefined
        );
        this.ui.onToolResult(name, result);

        // 添加工具结果到历史
        this.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
        this.trimHistory();

        // 失败熔断：同一工具本轮连续报错 ≥3 次则停（其余功能正常）
        if (result.startsWith("执行工具") || result.startsWith("错误：")) {
          failStreak[name] = (failStreak[name] || 0) + 1;
          if (failStreak[name] >= 3) {
            stoppedReason = `工具「${name}」连续 ${failStreak[name]} 次调用失败，已停止调用以免浪费轮次。其余功能正常——请检查该工具实现或配置后重试。`;
            break;
          }
        } else {
          failStreak[name] = 0;
        }
      }

      // 任一熔断条件触发即退出循环
      if (stoppedReason) break;
    }

    if (stoppedReason) {
      this.ui.onError(stoppedReason);
    } else if (iteration >= maxIterations) {
      this.ui.onError(
        `已达到最大工具调用次数（${maxIterations}）。若模型在反复调用同一工具，请检查该工具或调高「工具调用最大轮数」设置。`
      );
    }
  }

  /** 后台单次调用：抽取认知节点 → 沉积层；抽取稳定事实 → 意识层（机制⑦）。失败静默回退。 */
  private async extractAndRoute(userText: string, assistantText: string): Promise<void> {
    if (this.sedimentManager) this.sedimentManager.setProvider(this.provider);
    const deposit = this.sedimentManager && this.settings.enableSediment;
    if (!deposit) {
      await this.extractStableFactsOnly(userText, assistantText);
      return;
    }
    const chatText = `用户说：${userText}\n\n助手回答：${assistantText}`;
    const result = await extractAndRoute(this.provider, chatText, this.settings);
    if (!result) {
      // 沉积失败不再静默：本会话首次给出一次可见提示，避免"沉寂却无感知"
      if (!MessageHandler.sedimentWarnShown) {
        MessageHandler.sedimentWarnShown = true;
        new Notice("沉积层：本次未能抽取认知节点（LLM 调用失败），仅写入日记。请检查 LLM Provider 是否正常。");
      }
      console.warn("[sediment] 认知节点抽取失败，本次对话未沉积（已回退仅写日记）");
      await this.extractStableFactsOnly(userText, assistantText);
      return;
    }
    await this.sedimentManager!.depositTurn(userText, assistantText, result.cognitive_nodes);
    if (this.memoryManager && this.settings.enableMemory && result.stable_facts.length > 0) {
      await this.memoryManager.appendJournalEntry(result.stable_facts);
    }
    if (this.settings.enableSedimentAnalysis) {
      void this.sedimentManager!.runAnalysisPass();
    }
  }

  /** 仅抽取稳定事实写入意识层日记（Phase 1 兼容回退路径） */
  private async extractStableFactsOnly(userText: string, assistantText: string): Promise<void> {
    if (!this.memoryManager || !this.settings.enableMemory) return;
    const text = (assistantText || "").trim();
    if (!text) return;
    try {
      const sys =
        "你是一个记忆抽取器。请从下面的对话中，抽出值得长期记住的、关于“用户本人”的稳定事实" +
        "（如姓名、职业、偏好、重要约定、长期项目、常用工具等）。\n" +
        "只输出要点，每行一条，以 “- ” 开头。若没有值得记的内容，只输出一个空行。" +
        "不要复述对话、不要输出任何解释或前后缀。";
      const resp = await this.provider.chat(
        [
          { role: "system", content: sys },
          { role: "user", content: `用户说：${userText}\n\n助手回答：${assistantText}` },
        ],
        [],
        () => {}
      );
      const facts = (resp.content || "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- ") && l.length > 2)
        .map((l) => l.slice(2).trim())
        .filter((l) => l.length > 0);
      if (facts.length > 0) {
        await this.memoryManager.appendJournalEntry(facts);
      }
    } catch (e) {
      console.error("[MemoryManager] auto-extraction failed:", e);
    }
  }

  private splitOverflow(content: string): { clean: string; overflow: string } {
    const thinkPattern = /<think>([\s\S]*?)<\/think>/g;
    const overflowParts: string[] = [];
    const clean = content.replace(thinkPattern, (_, capture) => {
      overflowParts.push(capture.trim());
      return "";
    });
    return {
      clean: clean.replace(/\n{3,}/g, "\n\n").trim(),
      overflow: overflowParts.join("\n\n").trim(),
    };
  }

  private trimHistory(): void {
    const systemMsg = this.messages.find((m) => m.role === "system");
    const nonSystem = this.messages.filter((m) => m.role !== "system");

    if (nonSystem.length > this.settings.maxConversationHistory) {
      const trimmed = nonSystem.slice(-this.settings.maxConversationHistory);
      this.messages = systemMsg ? [systemMsg, ...trimmed] : trimmed;
    }
  }
}
