// L1/L2 投影：分层是视图，按 age 动态计算（化石不可变）
import { LLMChatSettings } from "../../settings";

export function projectLayer(createdMs: number, nowMs: number, s: LLMChatSettings): "L1" | "L2" {
  const ageDays = (nowMs - createdMs) / 86400000;
  return ageDays >= s.sedimentMetamorph.tDays ? "L2" : "L1";
}
