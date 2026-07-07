import { App } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const EDIT_NOTE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "edit_note",
    description:
      "编辑现有笔记的内容。可以替换整个内容、在开头或结尾追加、或在指定位置插入内容。",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "笔记的文件路径（相对于 vault 根目录），例如 '日记/2024-01-01.md'",
        },
        operation: {
          type: "string",
          enum: ["replace", "append", "prepend"],
          description: "操作类型：replace（替换全文）、append（追加到末尾）、prepend（插入到开头）",
        },
        content: {
          type: "string",
          description: "要写入的内容",
        },
        searchText: {
          type: "string",
          description: "用于定位替换位置的文本片段（仅 replace 模式需要，会替换匹配的第一处）",
        },
        newText: {
          type: "string",
          description: "替换后的新文本（仅 replace 模式且提供了 searchText 时使用）",
        },
      },
      required: ["filePath", "operation", "content"],
    },
  },
};

export async function executeEditNote(
  app: App,
  args: {
    filePath: string;
    operation: "replace" | "append" | "prepend";
    content: string;
    searchText?: string;
    newText?: string;
  }
): Promise<string> {
  const { filePath, operation, content, searchText, newText } = args;

  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) {
    return `错误：找不到文件 "${filePath}"。请检查路径是否正确。`;
  }

  const currentContent = await app.vault.read(file as import("obsidian").TFile);

  switch (operation) {
    case "replace": {
      if (searchText && newText !== undefined) {
        // 替换特定文本
        if (!currentContent.includes(searchText)) {
          return `错误：在文件中未找到 "${searchText.substring(0, 50)}..."。请确认搜索文本正确。`;
        }
        const newContent = currentContent.replace(searchText, newText);
        await app.vault.modify(file as import("obsidian").TFile, newContent);
        return `✅ 已将 "${filePath}" 中的指定内容替换。`;
      }
      // 替换全文
      await app.vault.modify(file as import("obsidian").TFile, content);
      return `✅ 已将 "${filePath}" 的内容替换为新内容。`;
    }

    case "append": {
      const newContent = currentContent + "\n" + content;
      await app.vault.modify(file as import("obsidian").TFile, newContent);
      return `✅ 已在 "${filePath}" 末尾追加内容。`;
    }

    case "prepend": {
      const newContent = content + "\n" + currentContent;
      await app.vault.modify(file as import("obsidian").TFile, newContent);
      return `✅ 已在 "${filePath}" 开头插入内容。`;
    }

    default:
      return `错误：不支持的操作 "${operation}"。`;
  }
}
