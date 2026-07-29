// 终答后台抽取 + 分流路由（机制①⑦）：一次 chat() 同时产出认知节点与稳定事实
import { LLMProvider } from "../llm/index";
import { LLMChatSettings } from "../settings";
import { callJSON } from "./core/llm-json";

export interface CognitiveNode {
  content: string;
  facies: string;
  stance: string;
}

export interface CaptureResult {
  cognitive_nodes: CognitiveNode[];
  stable_facts: string[];
}

const PROMPT = `你是 Sedimind 沉积层抽取器。阅读下面一段对话，输出严格 JSON：
{
  "cognitive_nodes": [
    {"content":"一句话认知节点（AI 的前提 / 用户的转折 / 关键决策）","facies":"assumption|reasoning|conclusion|question|decision|correction|reference","stance":"pro|con|neutral|tension"}
  ],
  "stable_facts": ["关于用户本人的稳定事实，每行一条，可空数组"]
}
规则：只抽"认知节点"而非整段对话；不要复述；只输出 JSON，无前后缀。`;

/**
 * 单次调用抽取认知节点 + 稳定事实。失败返回 null（调用方静默回退）。
 */
export async function extractAndRoute(
  provider: LLMProvider,
  chatText: string,
  _s: LLMChatSettings
): Promise<CaptureResult | null> {
  const result = await callJSON(provider, `${PROMPT}\n\n${chatText}`);
  if (!result) return null;
  return {
    cognitive_nodes: Array.isArray(result.cognitive_nodes) ? result.cognitive_nodes : [],
    stable_facts: Array.isArray(result.stable_facts) ? result.stable_facts : [],
  };
}
