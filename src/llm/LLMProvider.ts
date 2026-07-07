export interface ChatMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export interface ToolResult {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export interface LLMProvider {
  name: string;
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onChunk?: (chunk: string) => void,
    onReasoning?: (reasoning: string) => void,
    signal?: AbortSignal
  ): Promise<ChatMessage>;
  isConfigured(): boolean;
}
