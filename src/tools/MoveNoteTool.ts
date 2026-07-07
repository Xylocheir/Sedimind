import { App } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const MOVE_NOTE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "move_note",
    description: "移动或重命名笔记文件。",
    parameters: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "源文件路径（相对于 vault 根目录）",
        },
        destinationPath: {
          type: "string",
          description: "目标文件路径（相对于 vault 根目录）。如果只改文件名，可以不包含文件夹",
        },
      },
      required: ["sourcePath", "destinationPath"],
    },
  },
};

export async function executeMoveNote(
  app: App,
  args: { sourcePath: string; destinationPath: string }
): Promise<string> {
  const { sourcePath, destinationPath } = args;

  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!file) {
    return `错误：找不到源文件 "${sourcePath}"。`;
  }

  // 确保目标路径以 .md 结尾
  let destPath = destinationPath;
  if (!destPath.endsWith(".md")) {
    destPath += ".md";
  }

  // 确保目标目录存在
  const parts = destPath.split("/");
  if (parts.length > 1) {
    const folderPath = parts.slice(0, -1).join("/");
    const folderExists = app.vault.getAbstractFileByPath(folderPath);
    if (!folderExists) {
      await app.vault.createFolder(folderPath);
    }
  }

  await app.fileManager.renameFile(file as import("obsidian").TFile, destPath);
  return `✅ 已将 "${sourcePath}" 移动/重命名为 "${destPath}"。`;
}
