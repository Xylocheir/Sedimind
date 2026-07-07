import {
  JsonRpcRequest,
  JsonRpcResponse,
  McpServerConfig,
  McpTool,
  McpConnectionState,
} from "./McpTypes";
import { isMobile } from "../utils";

/**
 * MCP 客户端 — 管理与单个 MCP 服务器的连接（stdio 或 HTTP 传输）
 * 实现 JSON-RPC 2.0 协议，支持 tools/list 和 tools/call
 */
export class McpClient {
  private config: McpServerConfig;
  private state: McpConnectionState = "disconnected";
  private tools: McpTool[] = [];
  private nextId = 1;
  private pendingRequests: Map<number | string, (resp: JsonRpcResponse) => void> = new Map();
  private process: unknown = null;
  private buffer = "";

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  getConfig(): McpServerConfig {
    return this.config;
  }

  getState(): McpConnectionState {
    return this.state;
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  /** 连接到 MCP 服务器 */
  async connect(): Promise<McpTool[]> {
    if (this.state === "connected") {
      return this.tools;
    }

    this.state = "connecting";

    if (this.config.transport === "stdio") {
      await this.connectStdio();
    } else {
      throw new Error(`HTTP transport not yet implemented`);
    }

    // initialize
    try {
      await this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "Sedimind", version: "1.0.0" },
      });

      // 发送 initialized 通知
      this.sendNotification("notifications/initialized", {});

      // 拉取工具列表
      const result = await this.sendRequest("tools/list", {});
      const toolsResult = result as { tools: McpTool[] };
      this.tools = toolsResult.tools || [];
      this.state = "connected";

      console.log(`[McpClient] Connected to "${this.config.name}", ${this.tools.length} tools available`);
      return this.tools;
    } catch (error) {
      this.state = "error";
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[McpClient] Failed to connect to "${this.config.name}": ${errMsg}`);
      throw error;
    }
  }

  /** 调用远程 MCP 工具 */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.state !== "connected") {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }

    try {
      const result = await this.sendRequest("tools/call", {
        name,
        arguments: args,
      }) as { content: { type: string; text?: string }[]; isError?: boolean };

      if (result.isError) {
        return `错误：${result.content?.map((c) => c.text).join("\n") || "未知错误"}`;
      }

      return result.content?.map((c) => c.text).join("\n") || "";
    } catch (error) {
      return `MCP 工具调用失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.state === "disconnected") return;

    if (this.config.transport === "stdio" && this.process) {
      try {
        const proc = this.process as { kill?: () => void; stdin?: { end: () => void } };
        if (proc.stdin) proc.stdin.end();
        if (proc.kill) proc.kill();
      } catch {
        // ignore
      }
      this.process = null;
    }

    this.state = "disconnected";
    this.tools = [];
    this.buffer = "";
    this.pendingRequests.clear();
    console.log(`[McpClient] Disconnected from "${this.config.name}"`);
  }

  // ====== 内部方法 ======

  private async connectStdio(): Promise<void> {
    if (isMobile()) {
      throw new Error("MCP stdio 模式在移动设备上不可用");
    }
    const { spawn } = await import("child_process");

    return new Promise((resolve, reject) => {
      const command = this.config.command || "";
      const args = this.config.args || [];
      const env = this.config.env || {};

      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process = child;

      let connected = false;

      child.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      child.stderr?.on("data", (data: Buffer) => {
        console.warn(`[McpClient:${this.config.name}] stderr: ${data.toString().trim()}`);
      });

      child.on("error", (err: Error) => {
        if (!connected) {
          reject(new Error(`Failed to spawn MCP server: ${err.message}`));
        }
        this.state = "error";
      });

      child.on("close", (code: number | null) => {
        console.log(`[McpClient:${this.config.name}] Process exited with code ${code}`);
        this.state = "disconnected";
      });

      // stdio MCP 连接在初始化后才算成功
      setTimeout(() => {
        connected = true;
        resolve();
      }, 500);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const resolver = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          resolver(msg);
        }
      } catch {
        console.warn(`[McpClient:${this.config.name}] Failed to parse message: ${trimmed}`);
      }
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, (resp) => {
        if (resp.error) {
          reject(new Error(`MCP Error [${resp.error.code}]: ${resp.error.message}`));
        } else {
          resolve(resp.result);
        }
      });

      this.writeMessage(JSON.stringify(request) + "\n");

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request "${method}" timed out after 30s`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification = {
      jsonrpc: "2.0" as const,
      method,
      params,
    };
    this.writeMessage(JSON.stringify(notification) + "\n");
  }

  private writeMessage(data: string): void {
    if (this.process && (this.process as { stdin?: { write: (s: string) => void } }).stdin) {
      (this.process as { stdin: { write: (s: string) => void } }).stdin.write(data);
    }
  }
}
