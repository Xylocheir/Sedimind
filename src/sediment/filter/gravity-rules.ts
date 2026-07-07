import { FilterResult, GravityRulesConfig } from "../types";

export const DEFAULT_GRAVITY_CONFIG: GravityRulesConfig = {
  minLength: 10,
  highPriorityMinLength: 200,
};

/**
 * 判断文本是否为"纯标点 / 纯表情 / 纯空白"——即剔除空白后不含任何
 * 字母或数字（中文/英文/数字均视为有实质内容）。
 */
function isPureSymbol(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  if (!stripped) return true;
  const hasMeaningful = /[\p{L}\p{N}]/u.test(stripped);
  return !hasMeaningful;
}

/**
 * 重力筛选规则引擎。规则按顺序执行，首条匹配即返回。
 *
 * @param text        待筛选文本
 * @param lastContent 上一条已沉积内容（用于去重判断，可选）
 * @param config      阈值配置
 */
export function applyGravityFilter(
  text: string,
  lastContent?: string,
  config: GravityRulesConfig = DEFAULT_GRAVITY_CONFIG
): FilterResult {
  const trimmed = text.trim();

  // 1. 文本长度 < minLength 字符 → 蒸发
  if (trimmed.length < config.minLength) {
    return { action: "evaporate", reason: "too_short" };
  }

  // 2. 纯标点 / 纯表情 / 纯空白 → 蒸发
  if (isPureSymbol(trimmed)) {
    return { action: "evaporate", reason: "pure_symbol" };
  }

  // 3. 与上一条完全重复 → 蒸发
  if (lastContent && lastContent.trim() === trimmed) {
    return { action: "evaporate", reason: "duplicate" };
  }

  // 4. 包含代码块 ``` → 标记为重矿物
  if (trimmed.includes("```")) {
    return { action: "mark_high", reason: "code_block" };
  }

  // 5. 包含 Markdown 列表或标题 → 标记为重矿物
  if (
    /^\s{0,3}#{1,6}\s+/m.test(trimmed) ||   // 标题
    /^\s*[-*+]\s+/m.test(trimmed) ||        // 无序列表
    /^\s*\d+\.\s+/m.test(trimmed)           // 有序列表
  ) {
    return { action: "mark_high", reason: "structured" };
  }

  // 6. 超过 highPriorityMinLength 字符 → 标记为重矿物
  if (trimmed.length > config.highPriorityMinLength) {
    return { action: "mark_high", reason: "long_text" };
  }

  // 7. 其他 → 普通记录
  return { action: "record", reason: "default" };
}
