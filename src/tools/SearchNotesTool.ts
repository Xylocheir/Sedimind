import { App } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const SEARCH_NOTES_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "search_notes",
    description: "在 vault 中搜索包含指定关键词的笔记。支持搜索文件名和文件内容。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        searchIn: {
          type: "string",
          enum: ["content", "filename", "both"],
          description: "搜索范围：content（内容）、filename（文件名）、both（两者都搜）",
        },
        maxResults: {
          type: "number",
          description: "最大返回结果数，默认 10",
        },
        folder: {
          type: "string",
          description: "限定搜索的文件夹路径（可选）",
        },
      },
      required: ["query"],
    },
  },
};

export async function executeSearchNotes(
  app: App,
  args: {
    query: string;
    searchIn?: "content" | "filename" | "both";
    maxResults?: number;
    folder?: string;
  }
): Promise<string> {
  const { query, searchIn = "both", maxResults = 10, folder } = args;

  const allFiles = app.vault.getMarkdownFiles();
  let filteredFiles = allFiles;

  if (folder) {
    filteredFiles = allFiles.filter((f) => f.path.startsWith(folder));
  }

  const results: { path: string; matchType: string; preview: string }[] = [];

  for (const file of filteredFiles) {
    if (results.length >= maxResults) break;

    if (searchIn === "filename" || searchIn === "both") {
      if (file.basename.toLowerCase().includes(query.toLowerCase()) ||
          file.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          path: file.path,
          matchType: "文件名",
          preview: file.path,
        });
        continue;
      }
    }

    if (searchIn === "content" || searchIn === "both") {
      const content = await app.vault.read(file);
      const lowerContent = content.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const index = lowerContent.indexOf(lowerQuery);

      if (index !== -1) {
        const start = Math.max(0, index - 40);
        const end = Math.min(content.length, index + query.length + 40);
        let preview = content.substring(start, end);
        if (start > 0) preview = "..." + preview;
        if (end < content.length) preview = preview + "...";
        results.push({
          path: file.path,
          matchType: "内容",
          preview,
        });
      }
    }
  }

  if (results.length === 0) {
    return `未找到与 "${query}" 相关的笔记。`;
  }

  const resultsText = results
    .map(
      (r, i) =>
        `${i + 1}. **${r.path}**（${r.matchType}匹配）\n   \`${r.preview}\``
    )
    .join("\n\n");

  let summary = `🔍 搜索 "${query}" 找到 ${results.length} 条结果`;

  if (allFiles.length > filteredFiles.length) {
    summary += `（在 ${folder} 中搜索）`;
  }

  return summary + ":\n\n" + resultsText;
}
