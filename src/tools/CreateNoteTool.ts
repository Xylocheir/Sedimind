import { App, TFile } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const CREATE_NOTE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "create_note",
    description: "创建一个新的 Markdown 笔记。如果指定的路径包含子目录，会自动创建。如果 content 为空且指定了 folder，则只创建一个空目录（不创建文件）。",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "笔记的标题（不含扩展名）",
        },
        content: {
          type: "string",
          description: "笔记的 Markdown 内容。如果为空字符串且指定了 folder，则只创建目录不创建文件",
        },
        folder: {
          type: "string",
          description: "笔记所在的文件夹路径（可选），例如 '日记' 或 '项目/笔记'",
        },
      },
      required: ["title", "content"],
    },
  },
};

export async function executeCreateNote(
  app: App,
  args: { title: string; content: string; folder?: string }
): Promise<string> {
  const { title, content, folder } = args;

  // 清理文件名
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-");

  // 当 content 为空且指定了 folder 时，只创建文件夹（不创建文件）
  if (!content || content.trim() === "") {
    if (folder) {
      const safeFolder = folder.replace(/[\\:*?"<>|]/g, "-");
      const folderExists = app.vault.getAbstractFileByPath(safeFolder);
      if (folderExists) {
        return `ℹ️ 文件夹 "${safeFolder}" 已存在，无需创建。`;
      }
      await app.vault.createFolder(safeFolder);
      return `✅ 空文件夹已创建："${safeFolder}"`;
    }
    // 没有 folder 也不创建空文件，提示用户
    return `ℹ️ 没有指定文件夹路径，空内容无法创建。如需创建文件夹，请提供 folder 参数。`;
  }

  let filePath = safeTitle;

  if (folder) {
    const safeFolder = folder.split("/").map((s) => s.replace(/[\\:*?"<>|]/g, "-")).join("/");
    filePath = `${safeFolder}/${safeTitle}`;
  }

  if (!filePath.endsWith(".md")) {
    filePath += ".md";
  }

  const existingFile = app.vault.getAbstractFileByPath(filePath);
  if (existingFile) {
    return `错误：文件 "${filePath}" 已存在。请使用不同的标题或指定不同的文件夹。`;
  }

  // 确保父目录存在
  const parts = filePath.split("/");
  if (parts.length > 1) {
    const folderPath = parts.slice(0, -1).join("/");
    const folderExists = app.vault.getAbstractFileByPath(folderPath);
    if (!folderExists) {
      await app.vault.createFolder(folderPath);
    }
  }

  const file = await app.vault.create(filePath, content);
  return `✅ 笔记已创建："${filePath}"`;
}
