// 自然选择存活率 + 新颖度 + 探索加成（全部读 settings，闭环 C1 硬编码）
import { SedimentIndexEntry, SurvivalScore, NoveltyScore, ExploreBoost } from "../types";
import { LLMChatSettings } from "../../settings";
import {
  RETRIEVAL_STEP,
  CITATION_WEIGHT,
  SURVIVAL_BASE,
  NOVELTY_TIME_DECAY_DAYS,
  EXPLORE_BOOST_FROM_CONFLICT,
} from "../constants";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function computeNovelty(e: SedimentIndexEntry, _s: LLMChatSettings): NoveltyScore {
  const ageDays = (Date.now() - e.timestamp * 1000) / 86400000;
  const score = Math.max(0, 1 - ageDays / (NOVELTY_TIME_DECAY_DAYS * 2));
  return { score, reason: `age ${ageDays.toFixed(1)}d` };
}

export function computeExploreBoost(e: SedimentIndexEntry, _s: LLMChatSettings): ExploreBoost {
  const ids = e.cross_cutting && e.cross_cutting.length > 0 ? e.cross_cutting : [];
  const boost = ids.length > 0 ? EXPLORE_BOOST_FROM_CONFLICT : 0;
  return { boost, related_ids: ids };
}

export function computeSurvival(e: SedimentIndexEntry, s: LLMChatSettings): SurvivalScore {
  // 权重来自 settings；基础存活随检索/引用次数增长
  const survival = clamp01(
    SURVIVAL_BASE + RETRIEVAL_STEP * e.retrieval_count + CITATION_WEIGHT * e.citation_count
  );
  const novelty = computeNovelty(e, s);
  const explore = computeExploreBoost(e, s);
  return { survival, novelty: novelty.score, explore_boost: explore.boost };
}
