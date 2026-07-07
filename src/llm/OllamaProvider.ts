import { LLMProvider, ChatMessage, ToolDefinition } from "./LLMProvider";
import { LLMChatSettings } from "../settings";

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export class OllamaProvider implements LLMProvider {
  name = "Ollama";
  private settings: LLMChatSettings;

  constructor(settings: LLMChatSettings) {
    this.settings = settings;
  }

  isConfigured(): boolean {
    // Ollama 默认使用 localhost，无需特殊配置
    return true;
  }

  /** 从 Ollama API 获取本地已安装的模型列表 */
  static async fetchModels(baseUrl: string): Promise<OllamaModel[]> {
    try {
      const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return (data.models || []) as OllamaModel[];
    } catch {
      return [];
    }
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onChunk?: (chunk: string) => void
  ): Promise<ChatMessage> {
    const url = `${this.settings.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`;

    // 将 tools 转换为 Ollama 格式
    const ollamaTools = tools.map((t) => ({
      type: "function",
      function: t.function,
    }));

    const body: Record<string, unknown> = {
      model: this.settings.ollamaModel,
      messages: messages.map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role === "tool" ? "user" : m.role,
          content: m.content,
        };
        if (m.tool_calls) {
          msg.tool_calls = m.tool_calls;
        }
        if (m.tool_call_id) {
          msg.tool_call_id = m.tool_call_id;
        }
        return msg;
      }),
      stream: !!onChunk,
      options: {
        temperature: this.settings.temperature,
        num_predict: this.settings.maxTokens,
      },
    };

    if (ollamaTools.length > 0) {
      body.tools = ollamaTools;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama API 错误 (${response.status}): ${err}`);
    }

    if (onChunk) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let fullContent = "";
      let toolCalls: Record<number, { id: string; name: string; args: string }> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const msg = parsed.message;

            if (msg?.content) {
              fullContent += msg.content;
              onChunk(fullContent);
            }

            if (msg?.tool_calls) {
              for (const tc of msg.tool_calls) {
                const idx = tc.index ?? Object.keys(toolCalls).length;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = {
                    id: tc.id || `call_${idx}`,
                    name: "",
                    args: "",
                  };
                }
                if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                if (tc.function?.arguments) {
                  if (typeof tc.function.arguments === "object") {
                    toolCalls[idx].args = JSON.stringify(tc.function.arguments);
                  } else {
                    toolCalls[idx].args += tc.function.arguments;
                  }
                }
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      const tcArray = Object.values(toolCalls);
      if (tcArray.length > 0 && tcArray[0].name) {
        return {
          role: "assistant",
          content: fullContent || "",
          tool_calls: tcArray.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.args },
          })),
        };
      }

      return { role: "assistant", content: fullContent };
    }

    const data = await response.json();
    const msg = data.message;

    return {
      role: "assistant",
      content: msg?.content || "",
      tool_calls: msg?.tool_calls?.map((tc: Record<string, unknown>) => ({
        id: (tc.id as string) || `call_${Date.now()}`,
        type: "function" as const,
        function: {
          name: (tc.function as Record<string, string>).name,
          arguments:
            typeof (tc.function as Record<string, unknown>).arguments === "string"
              ? (tc.function as Record<string, string>).arguments
              : JSON.stringify((tc.function as Record<string, unknown>).arguments),
        },
      })),
    };
  }
}
