import { LLMProvider, ChatMessage, ToolDefinition } from "./LLMProvider";
import { LLMChatSettings } from "../settings";

export class GeminiProvider implements LLMProvider {
  name = "Gemini";
  private settings: LLMChatSettings;

  constructor(settings: LLMChatSettings) {
    this.settings = settings;
  }

  isConfigured(): boolean {
    return this.settings.geminiApiKey.trim().length > 0;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onChunk?: (chunk: string) => void,
    onReasoning?: (reasoning: string) => void,
    signal?: AbortSignal
  ): Promise<ChatMessage> {
    const url = `https://generativelanguage.googleapis.com/v1/models/${this.settings.geminiModel}:streamGenerateContent?key=${this.settings.geminiApiKey}`;

    const geminiMessages: Record<string, unknown>[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        continue;
      }
      if (msg.role === "user") {
        geminiMessages.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        const parts: Record<string, unknown>[] = [{ text: msg.content || "" }];
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments),
              },
            });
          }
        }
        geminiMessages.push({
          role: "model",
          parts,
        });
      } else if (msg.role === "tool") {
        geminiMessages.push({
          role: "user",
          parts: [{ functionResponse: { name: msg.name || "", response: { text: msg.content } } }],
        });
      }
    }

    const body: Record<string, unknown> = {
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: this.settings.maxTokens,
        temperature: this.settings.temperature,
      },
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        functionDeclarations: [t.function],
      }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API 错误 (${response.status}): ${err}`);
    }

    const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let fullContent = "";
    let toolCalls: Record<string, { id: string; name: string; args: Record<string, unknown> }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const jsonStr = line.replace("data: ", "").trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const candidates = parsed.candidates;
          if (!candidates || candidates.length === 0) continue;

          const candidate = candidates[0];
          const content = candidate.content;
          if (!content) continue;

          if (content.parts) {
            for (const part of content.parts) {
              if (part.text) {
                fullContent += part.text;
                if (onChunk) onChunk(fullContent);
              }
              if (part.functionCall) {
                const callId = part.functionCall.name + "_" + Date.now();
                toolCalls[callId] = {
                  id: callId,
                  name: part.functionCall.name,
                  args: part.functionCall.args || {},
                };
              }
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
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    }

    return { role: "assistant", content: fullContent };
  }
}
