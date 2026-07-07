import { LLMProvider, ChatMessage, ToolDefinition } from "./LLMProvider";
import { LLMChatSettings } from "../settings";

export class AnthropicProvider implements LLMProvider {
  name = "Anthropic";
  private settings: LLMChatSettings;
  private baseUrl: string;

  constructor(settings: LLMChatSettings, baseUrl?: string) {
    this.settings = settings;
    this.baseUrl = baseUrl || "https://api.anthropic.com";
  }

  isConfigured(): boolean {
    return this.settings.anthropicApiKey.trim().length > 0;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onChunk?: (chunk: string) => void
  ): Promise<ChatMessage> {
    const url = `${this.baseUrl}/v1/messages`;

    // 分离 system 消息
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        };

        if (m.tool_calls) {
          msg.content = [
            ...(m.content ? [{ type: "text", text: m.content }] : []),
            ...m.tool_calls.map((tc) => ({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || "{}"),
            })),
          ];
        }

        if (m.role === "tool") {
          msg.role = "user";
          msg.content = [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id,
              content: m.content,
            },
          ];
        }

        return msg;
      });

    // 转换 tools 格式
    const anthropicTools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const body: Record<string, unknown> = {
      model: this.settings.anthropicModel,
      max_tokens: this.settings.maxTokens,
      temperature: this.settings.temperature,
      messages: chatMessages,
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    if (anthropicTools.length > 0) {
      body.tools = anthropicTools;
    }

    if (onChunk) {
      body.stream = true;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.settings.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API 错误 (${response.status}): ${err}`);
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
          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === "content_block_delta") {
              if (parsed.delta?.type === "text_delta") {
                fullContent += parsed.delta.text || "";
                onChunk(fullContent);
              }
              // 处理 tool_use 增量
              if (parsed.delta?.type === "input_json_delta") {
                const idx = parsed.index || 0;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = { id: "", name: "", args: "" };
                }
                toolCalls[idx].args += parsed.delta.partial_json || "";
              }
            }

            if (parsed.type === "content_block_start") {
              if (parsed.content_block?.type === "tool_use") {
                const idx = parsed.index || 0;
                toolCalls[idx] = {
                  id: parsed.content_block.id || "",
                  name: parsed.content_block.name || "",
                  args: "",
                };
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

    // 非流式模式
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.settings.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API 错误 (${response.status}): ${err}`);
    }

    const data = await response.json();

    let content = "";
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

    for (const block of data.content || []) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      role: "assistant",
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
