// 统一的 JSON 抽取封装：所有 Phase 2 的 chat() 抽取都走这里。
// 真实契约：LLMProvider.chat(messages, tools?, onChunk?, onReasoning?, signal?) → ChatMessage，结果在 .content。
import { LLMProvider, ChatMessage } from "../../llm/index";

/**
 * 用一次 chat() 调用抽取 JSON，失败时返回 null（调用方必须静默回退）。
 */
export async function callJSON(provider: LLMProvider, prompt: string): Promise<any> {
  let resp: ChatMessage;
  try {
    resp = await provider.chat([{ role: "user", content: prompt } as ChatMessage], []);
  } catch (e) {
    console.error("[sediment] callJSON chat failed:", e);
    return null;
  }
  const text = (resp && resp.content ? resp.content : "").trim();
  if (!text) return null;
  const m =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[1] !== undefined ? m[1] : m[0]);
  } catch (e) {
    console.error("[sediment] callJSON parse failed:", e);
    return null;
  }
}
