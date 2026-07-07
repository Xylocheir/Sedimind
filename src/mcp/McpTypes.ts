// ====== JSON-RPC 2.0 基础类型 ======

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// ====== MCP 协议核心类型 ======

/** MCP 服务器连接配置 */
export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: "stdio" | "http";
  /** stdio 模式：命令路径 */
  command?: string;
  /** stdio 模式：命令参数 */
  args?: string[];
  /** HTTP 模式：服务端 URL */
  url?: string;
  /** stdio 模式：环境变量 */
  env?: Record<string, string>;
}

/** initialize 方法返回的服务器能力 */
export interface ServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
}

/** initialize 返回结果 */
export interface InitializeResult {
  protocolVersion: string;
  serverInfo?: { name: string; version: string };
  capabilities: ServerCapabilities;
}

/** 工具列表项 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** tools/list 返回结果 */
export interface ListToolsResult {
  tools: McpTool[];
}

/** tools/call 请求参数 */
export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/** tools/call 返回结果中的内容项 */
export interface ToolCallContent {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/** tools/call 返回结果 */
export interface CallToolResult {
  content: ToolCallContent[];
  isError?: boolean;
}

// ====== MCP 客户端连接状态 ======

export type McpConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface McpConnectionInfo {
  config: McpServerConfig;
  state: McpConnectionState;
  tools: McpTool[];
  error?: string;
}
