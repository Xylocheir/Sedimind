import { App, TFolder, TFile } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const DELETE_NOTE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "delete_note",
    description:
      "删除指定的笔记文件或文件夹。此操作会将文件/文件夹移到系统回收站（如果启用）。删除文件夹时会递归删除其中的所有内容。",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "要删除的文件或文件夹路径（相对于 vault 根目录）",
        },
        confirm: {
          type: "boolean",
          description: "必须设置为 true 才能执行删除操作，用于防止误删",
        },
      },
      required: ["filePath", "confirm"],
    },
  },
};

/** 递归移动到回收站：先处理子内容，再处理文件夹本身 */
async function trashRecursive(app: App, item: TFile | TFolder): Promise<void> {
  if (item instanceof TFolder) {
    // 先递归删除所有子内容
    for (const child of [...item.children]) {
      await trashRecursive(app, child as TFile | TFolder);
    }
  }
  await app.vault.trash(item, true);
}

export async function executeDeleteNote(
  app: App,
  args: { filePath: string; confirm: boolean }
): Promise<string> {
  const { filePath, confirm } = args;

  if (!confirm) {
    return `⚠️ 删除操作需要 confirm=true 确认。请明确确认后重试。`;
  }

  const item = app.vault.getAbstractFileByPath(filePath);
  if (!item) {
    return `错误：找不到 "${filePath}"。`;
  }

  const itemName = item.name;
  const isFolder = item instanceof TFolder;

  await trashRecursive(app, item as TFile | TFolder);

  if (isFolder) {
    return `🗑️ 已将文件夹 "${itemName}/" 及其内容移到回收站。`;
  }
  return `🗑️ 已将 "${itemName}" 移到回收站。`;
}
