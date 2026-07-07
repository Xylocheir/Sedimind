import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const LIST_FILES_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "list_files",
    description: "列出指定目录中的所有文件和子文件夹。",
    parameters: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description: "要列出的文件夹路径，留空则列出 vault 根目录",
        },
        recursive: {
          type: "boolean",
          description: "是否递归列出子目录，默认 false",
        },
        maxResults: {
          type: "number",
          description: "最大返回结果数，默认 50",
        },
      },
      required: [],
    },
  },
};

function collectItems(
  folder: TFolder,
  recursive: boolean,
  maxResults: number,
  prefix: string = ""
): string[] {
  const items: string[] = [];
  const children = folder.children;

  for (const child of children) {
    if (items.length >= maxResults) break;

    if (child instanceof TFolder) {
      items.push(`📁 ${prefix}${child.name}/`);
      if (recursive) {
        items.push(
          ...collectItems(child, recursive, maxResults - items.length, prefix + "  ")
        );
      }
    } else {
      const ext = (child as TFile).extension;
      const icon = ext === "md" ? "📝" : ext === "canvas" ? "🎨" : "📎";
      items.push(`${icon} ${prefix}${child.name}`);
    }
  }

  return items;
}

export async function executeListFiles(
  app: App,
  args: { folder?: string; recursive?: boolean; maxResults?: number }
): Promise<string> {
  const { folder: folderPath, recursive = false, maxResults = 50 } = args;

  let targetFolder: TFolder;
  if (folderPath) {
    const item = app.vault.getAbstractFileByPath(folderPath);
    if (!item || !(item instanceof TFolder)) {
      return `错误：找不到文件夹 "${folderPath}"。`;
    }
    targetFolder = item;
  } else {
    targetFolder = app.vault.getRoot();
  }

  const items = collectItems(targetFolder, recursive, maxResults);

  if (items.length === 0) {
    return `📂 "${folderPath || "/"}" 目录为空。`;
  }

  const header = `📂 **${folderPath || "/"}**（共 ${items.length} 项）：\n\n`;
  return header + items.join("\n");
}
