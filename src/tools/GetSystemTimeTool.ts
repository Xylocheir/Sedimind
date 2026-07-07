import { App } from "obsidian";
import { ToolDefinition } from "../llm/LLMProvider";

export const GET_SYSTEM_TIME_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "get_system_time",
    description: "获取当前系统日期和时间（精确到秒）。无需参数。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

export async function executeGetSystemTime(app: App): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekday = weekdays[now.getDay()];

  const lines: string[] = [];
  lines.push(`🕐 **当前系统时间**`);
  lines.push("");
  lines.push(`- 📅 日期：${year}年${month}月${day}日 ${weekday}`);
  lines.push(`- ⏰ 时间：${hours}:${minutes}:${seconds}`);
  lines.push(`- 🌐 ISO 8601：${now.toISOString()}`);
  lines.push(`- 🕛 Unix 时间戳：${Math.floor(now.getTime() / 1000)}`);

  return lines.join("\n");
}
