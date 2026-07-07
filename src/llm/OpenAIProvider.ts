import { LLMProvider, ChatMessage, ToolDefinition } from "./LLMProvider";
import { LLMChatSettings } from "../settings";

/** 自定义供应商配置（OpenAI 兼容端点） */
export interface OpenAIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class OpenAIProvider implements LLMProvider {
  private settings: LLMChatSettings;
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private isCustom: boolean;

  constructor(settings: LLMChatSettings, custom?: OpenAIProviderConfig) {
    this.settings = settings;
    if (custom) {
      this.baseUrl = custom.baseUrl;
      this.apiKey = custom.apiKey;
      this.model = custom.model;
      this.isCustom = true;
    } else {
      this.baseUrl = settings.openaiBaseUrl;
      this.apiKey = settings.openaiApiKey;
      this.model = settings.openaiModel;
      this.isCustom = false;
    }
  }

  get name(): string {
    return this.isCustom ? "Custom API" : "OpenAI";
  }

  isConfigured(): boolean {
    // 自定义供应商：baseUrl 必填，apiKey 可选（本地/内网端点无需鉴权）
    if (this.isCustom) return this.baseUrl.trim().length > 0;
    return this.apiKey.trim().length > 0;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onChunk?: (chunk: string) => void,
    onReasoning?: (reasoning: string) => void,
    signal?: AbortSignal
  ): Promise<ChatMessage> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.settings.maxTokens,
      temperature: this.settings.temperature,
    };

    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    // Streaming 模式
    if (onChunk) {
      body.stream = true;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API 错误 (${response.status}): ${err}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let fullContent = "";
      let toolCalls: Record<number, { id: string; name: string; args: string }> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const jsonStr = line.replace("data: ", "").trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              onChunk(fullContent);
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: tc.id || "", name: "", args: "" };
                }
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      const tcArray = Object.values(toolCalls);
      if (tcArray.length > 0) {
        return {
          role: "assistant",
          content: fullContent || "",
          tool_calls: tcArray.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.args }
          })),
        };
      }

      return { role: "assistant", content: fullContent };
    }

    // 非流式模式
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API 错误 (${response.status}): ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;

    return {
      role: "assistant",
      content: msg?.content || "",
      tool_calls: msg?.tool_calls?.map((tc: Record<string, unknown>) => ({
        id: tc.id as string,
        type: "function" as const,
        function: {
          name: (tc.function as Record<string, string>).name,
          arguments: (tc.function as Record<string, string>).arguments,
        },
      })),
    };
  }
}
