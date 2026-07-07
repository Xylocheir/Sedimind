import { App, Notice } from "obsidian";
import { McpClient } from "./McpClient";
import { McpServerConfig, McpTool, McpConnectionInfo } from "./McpTypes";
import { ToolDefinition } from "../llm/LLMProvider";
import { executeToolCall } from "../tools/index";
import { isMobile } from "../utils";

/**
 * MCP 管理器 — 管理多个 MCP 服务器连接
 * 负责：连接/断开、工具聚合、工具调度
 */
export class McpManager {
  private clients: Map<string, McpClient> = new Map();
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 获取所有连接信息（用于 UI 展示） */
  getConnectionInfos(): McpConnectionInfo[] {
    return Array.from(this.clients.values()).map((client) => ({
      config: client.getConfig(),
      state: client.getState(),
      tools: client.getTools(),
    }));
  }

  /** 连接单个服务器 */
  async connectServer(config: McpServerConfig): Promise<McpTool[]> {
    if (isMobile()) {
      new Notice("MCP 功能在移动设备上不可用");
      throw new Error("MCP 功能在移动设备上不可用");
    }

    if (this.clients.has(config.id)) {
      await this.disconnectServer(config.id);
    }

    const client = new McpClient(config);
    this.clients.set(config.id, client);

    try {
      return await client.connect();
    } catch (error) {
      console.error(`[McpManager] Failed to connect to "${config.name}":`, error);
      throw error;
    }
  }

  /** 断开指定服务器 */
  async disconnectServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      client.disconnect();
      this.clients.delete(id);
    }
  }

  /** 断开所有服务器 */
  disconnectAll(): void {
    for (const [id] of this.clients) {
      this.disconnectServer(id);
    }
  }

  /** 获取所有已连接服务器的工具定义（供 LLM Function Calling 使用） */
  getAllMcpToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];

    for (const client of this.clients.values()) {
      if (client.getState() !== "connected") continue;

      const config = client.getConfig();
      for (const tool of client.getTools()) {
        definitions.push(this.mcpToolToDefinition(tool, config.name));
      }
    }

    return definitions;
  }

  /** 执行 MCP 工具调用 */
  async callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
    // MCP 工具名格式：mcp__{serverId}__{toolName}
    // 首先尝试解析
    for (const client of this.clients.values()) {
      if (client.getState() !== "connected") continue;

      const config = client.getConfig();
      const prefixedName = `mcp__${config.id}__`;

      if (name.startsWith(prefixedName)) {
        const toolName = name.slice(prefixedName.length);
        return await client.callTool(toolName, args);
      }

      // 也尝试原始工具名匹配
      const found = client.getTools().find((t) => t.name === name);
      if (found) {
        return await client.callTool(name, args);
      }
    }

    return `错误：未找到已连接的 MCP 工具 "${name}"。`;
  }

  /** 将 MCP Tool 转换为 LLM ToolDefinition */
  private mcpToolToDefinition(tool: McpTool, serverName: string): ToolDefinition {
    const toolName = `mcp__${serverName.replace(/[^a-zA-Z0-9_-]/g, "_")}__${tool.name}`;
    const description = tool.description
      ? `[MCP:${serverName}] ${tool.description}`
      : `[MCP:${serverName}] ${tool.name}`;

    return {
      type: "function",
      function: {
        name: toolName,
        description,
        parameters: {
          type: "object",
          properties: tool.inputSchema.properties || {},
          required: tool.inputSchema.required || [],
        },
      },
    };
  }
}
