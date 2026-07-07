import { App, TFile } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const GET_METADATA_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "get_metadata",
    description: "获取笔记的元数据，包括创建时间、修改时间、大小、标签、frontmatter 等。",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "笔记的文件路径（相对于 vault 根目录）",
        },
      },
      required: ["filePath"],
    },
  },
};

export async function executeGetMetadata(
  app: App,
  args: { filePath: string }
): Promise<string> {
  const { filePath } = args;

  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file || !(file instanceof TFile)) {
    return `错误：找不到文件 "${filePath}"。`;
  }

  const cache = app.metadataCache.getFileCache(file);
  const stat = await app.vault.adapter.stat(filePath);

  const lines: string[] = [];
  lines.push(`📋 **${file.path}** 元数据：`);
  lines.push("");
  lines.push(`- 📅 创建时间：${stat?.ctime ? new Date(stat.ctime).toLocaleString("zh-CN") : "未知"}`);
  lines.push(`- ✏️ 修改时间：${stat?.mtime ? new Date(stat.mtime).toLocaleString("zh-CN") : "未知"}`);
  lines.push(`- 📏 文件大小：${stat?.size ? formatSize(stat.size) : "未知"}`);
  lines.push(`- 📝 扩展名：${file.extension}`);

  if (cache?.frontmatter) {
    lines.push(`- 🏷️ Frontmatter：`);
    for (const [key, value] of Object.entries(cache.frontmatter)) {
      const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
      lines.push(`  - ${key}: ${displayValue}`);
    }
  }

  if (cache?.tags) {
    const tags = cache.tags.map((t) => t.tag);
    lines.push(`- 🔖 标签：${tags.join(", ")}`);
  }

  if (cache?.headings) {
    const headings = cache.headings.map((h) => `${"#".repeat(h.level)} ${h.heading}`);
    lines.push(`- 📑 标题结构：`);
    headings.forEach((h) => lines.push(`  ${h}`));
  }

  if (cache?.links) {
    lines.push(`- 🔗 链接数：${cache.links.length}`);
  }

  if (cache?.embeds) {
    lines.push(`- 🖼️ 嵌入数：${cache.embeds.length}`);
  }

  return lines.join("\n");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
