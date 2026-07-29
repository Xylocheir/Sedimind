import type { SedimentIndexEntry, Facies, Stance } from "../types";

// 反差度基分：化石相越高越值得在注入时"打脸"当前话题
const FACIES_CONTRAST: Record<Facies, number> = {
  correction: 0.5,
  question: 0.2,
  assumption: 0.15,
  decision: 0.1,
  reasoning: 0.1,
  conclusion: 0.05,
  reference: 0.0,
};

const STANCE_CONTRAST: Record<Stance, number> = {
  tension: 0.4,
  con: 0.3,
  neutral: 0.1,
  pro: 0.0,
};

/**
 * 反差度（contrast）：越高表示越该在注入时挑战当前话题、打断 AI 惯性。
 * 计算完全本地、零 LLM：基于化石相/立场 + 越老越该被重新检视的考古加成。
 */
export function contrastScoreFor(e: SedimentIndexEntry): number {
  const base =
    (e.facies ? FACIES_CONTRAST[e.facies] : 0) +
    (e.stance ? STANCE_CONTRAST[e.stance] : 0);
  const ageDays = (Date.now() / 1000 - e.timestamp) / 86400;
  const ageBonus = ageDays > 180 && e.survival_score > 0.5 ? 0.1 : 0;
  return Math.max(0, Math.min(1, base + ageBonus));
}
