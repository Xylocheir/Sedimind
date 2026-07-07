import { App } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const READ_NOTE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "read_note",
    description: "读取指定笔记的全部内容或部分内容。",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "笔记的文件路径（相对于 vault 根目录），例如 '日记/2024-01-01.md'",
        },
        maxLength: {
          type: "number",
          description: "最大返回字符数，超过时会被截断。默认返回全部内容",
        },
      },
      required: ["filePath"],
    },
  },
};

export async function executeReadNote(
  app: App,
  args: { filePath: string; maxLength?: number }
): Promise<string> {
  const { filePath, maxLength } = args;

  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) {
    return `错误：找不到文件 "${filePath}"。请检查路径是否正确。`;
  }

  const content = await app.vault.read(file as import("obsidian").TFile);

  if (maxLength && content.length > maxLength) {
    return (
      `📄 **${filePath}**（内容超过 ${maxLength} 字符，已截断，共 ${content.length} 字符）：\n\n` +
      content.substring(0, maxLength) +
      "\n\n...(内容已截断)..."
    );
  }

  return `📄 **${filePath}**（共 ${content.length} 字符）：\n\n${content}`;
}
