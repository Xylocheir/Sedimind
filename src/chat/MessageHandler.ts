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
import { MemoryManager, RecentConversation } from "../memory/MemoryManager";

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

    // 注入近期对话记忆
    if (this.memoryManager) {
      prompt += this.memoryManager.getRecentConversationsContext();
      const savedMemory = await this.memoryManager.getSavedMemoryContext();
      if (savedMemory) {
        prompt += savedMemory;
      }
    }

    // 如果用户要求记住信息，添加记忆保存指令
    if (this.settings.enableSavedMemory) {
if (this.settings.enableSediment && this.sedimentManager) {
      prompt +=
        `\n\n[沉积层协议] 在给出最终答案之前，请先用 <think> 标签写出你的思考过程，包括你考虑过的不同思路和放弃的理由。\n` +
        `格式：<think>思考内容</think>。这部分不会被用户看到，会被自动剥离并沉积。不要在工具调用中间回合输出 <think>，只在最终回答前输出。\n`;
      // forage not available yet - sediment layer will be enhanced later
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

  /** 保存对话摘要到记忆系统 */
  async saveConversationSummary(title: string): Promise<void> {
    if (!this.memoryManager) return;
    const summary = this.memoryManager.generateSummary(this.messages);
    await this.memoryManager.saveRecentConversation(
      `conv_${Date.now()}`,
      title,
      summary
    );
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
    let iteration = 0;
    const maxIterations = 10; // 防止无限循环

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
      }

      // 继续循环，让 LLM 处理工具结果
    }

    if (iteration >= maxIterations) {
      this.ui.onError("达到最大工具调用次数限制，已停止处理。");
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
