import { App } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";
import { CREATE_NOTE_TOOL, executeCreateNote } from "./CreateNoteTool";
import { EDIT_NOTE_TOOL, executeEditNote } from "./EditNoteTool";
import { SEARCH_NOTES_TOOL, executeSearchNotes } from "./SearchNotesTool";
import { READ_NOTE_TOOL, executeReadNote } from "./ReadNoteTool";
import { LIST_FILES_TOOL, executeListFiles } from "./ListFilesTool";
import { DELETE_NOTE_TOOL, executeDeleteNote } from "./DeleteNoteTool";
import { MOVE_NOTE_TOOL, executeMoveNote } from "./MoveNoteTool";
import { GET_METADATA_TOOL, executeGetMetadata } from "./GetMetadataTool";
import { GET_SYSTEM_TIME_TOOL, executeGetSystemTime } from "./GetSystemTimeTool";

/** 内置工具定义 */
const BUILTIN_TOOLS: ToolDefinition[] = [
  CREATE_NOTE_TOOL,
  EDIT_NOTE_TOOL,
  SEARCH_NOTES_TOOL,
  READ_NOTE_TOOL,
  LIST_FILES_TOOL,
  DELETE_NOTE_TOOL,
  MOVE_NOTE_TOOL,
  GET_METADATA_TOOL,
  GET_SYSTEM_TIME_TOOL,
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "保存一条用户明确要求记住的信息到记忆库。当用户说'记住XXX'、'帮我记下XXX'、'保存这个...'时调用。",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "要保存的记忆内容",
          },
        },
        required: ["content"],
      },
    },
  },
];

/** 外部工具定义（由 MCP Manager 动态注入） */
let externalTools: ToolDefinition[] = [];

/** 所有可用的工具定义（内置 + 外部） */
export function getAllTools(): ToolDefinition[] {
  return [...BUILTIN_TOOLS, ...externalTools];
}

/** 设置外部工具（由 MCP Manager 调用） */
export function setExternalTools(tools: ToolDefinition[]): void {
  externalTools = tools;
}

/** @deprecated 使用 getAllTools() */
export const ALL_TOOLS: ToolDefinition[] = BUILTIN_TOOLS;

/** 执行工具调用并返回结果（支持内置 + 外部 MCP 工具） */
export async function executeToolCall(
  app: App,
  name: string,
  args: Record<string, unknown>,
  mcpCallFn?: (name: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  try {
    switch (name) {
      case "create_note":
        return await executeCreateNote(app, args as { title: string; content: string; folder?: string });

      case "edit_note":
        return await executeEditNote(app, args as {
          filePath: string;
          operation: "replace" | "append" | "prepend";
          content: string;
          searchText?: string;
          newText?: string;
        });

      case "search_notes":
        return await executeSearchNotes(app, args as {
          query: string;
          searchIn?: "content" | "filename" | "both";
          maxResults?: number;
          folder?: string;
        });

      case "read_note":
        return await executeReadNote(app, args as { filePath: string; maxLength?: number });

      case "list_files":
        return await executeListFiles(app, args as {
          folder?: string;
          recursive?: boolean;
          maxResults?: number;
        });

      case "delete_note":
        return await executeDeleteNote(app, args as { filePath: string; confirm: boolean });

      case "move_note":
        return await executeMoveNote(app, args as { sourcePath: string; destinationPath: string });

      case "get_metadata":
        return await executeGetMetadata(app, args as { filePath: string });

      case "get_system_time":
        return await executeGetSystemTime(app);

      default:
        // 尝试匹配 MCP 外部工具
        if (mcpCallFn) {
          return await mcpCallFn(name, args);
        }
        return `错误：未知工具 "${name}"。`;
    }
  } catch (error) {
    return `执行工具 "${name}" 时发生错误：${error instanceof Error ? error.message : String(error)}`;
  }
}
