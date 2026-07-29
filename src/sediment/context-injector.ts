// 反差注入：按 rankScore 降序取 top，截断到 token 预算；冲突项优先纳入
import { SedimentIndexEntry, InjectionContext } from "./types";
import { LLMChatSettings } from "../settings";
import { rankScore } from "./core/rank";

export class ContextInjector {
  buildContext(
    entries: SedimentIndexEntry[],
    s: LLMChatSettings,
    budget?: { maxBlocks: number; maxTokens: number }
  ): InjectionContext {
    const maxBlocks = budget?.maxBlocks ?? s.sedimentInjection.maxBlocks;
    const maxTokens = budget?.maxTokens ?? s.sedimentInjection.maxTokens;

    const ranked = [...entries]
      .filter((e) => e.source_file)
      .sort((a, b) => rankScore(b, s) - rankScore(a, s));

    const blocks: InjectionContext["blocks"] = [];
    let tokens = 0;
    for (const e of ranked) {
      if (blocks.length >= maxBlocks) break;
      const excerpt = `[${e.topic}] ${(e.facies || "")}`.trim();
      const t = excerpt.length;
      if (tokens + t > maxTokens && blocks.length > 0) break;
      blocks.push({ path: e.source_file, excerpt, score: rankScore(e, s) });
      tokens += t;
    }
    return { blocks, tokens };
  }
}
