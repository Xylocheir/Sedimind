// 检索排序：综合存活率/新颖度/探索加成/反差，权重全部读 settings（闭环 C1）
import { SedimentIndexEntry } from "../types";
import { LLMChatSettings } from "../../settings";
import { computeSurvival } from "./survival";
import { contrastScoreFor } from "./contrast";

export function rankScore(e: SedimentIndexEntry, s: LLMChatSettings): number {
  const w = s.sedimentWeight;
  const { survival, novelty, explore_boost } = computeSurvival(e, s);
  // 地质勘探排序：存活率 + 反差度 双重加权，所有节点均参与（不再仅 cross_cutting）
  const contrast = contrastScoreFor(e);
  return (
    w.survival * survival +
    w.novelty * novelty +
    w.explore * explore_boost +
    w.contrast * contrast
  );
}
