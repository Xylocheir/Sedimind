import { App } from "obsidian";
import type { LLMChatSettings } from "../settings";
import type { LLMProvider } from "../llm/index";
import { callJSON } from "./core/llm-json";
import { readJson, writeJson } from "./storage/derived-store";
import {
  HYBRID_OLD_DAYS,
  HYBRID_PICK,
  HYBRID_LOW_WEIGHT_FACTOR,
} from "./constants";
import type { SedimentIndexEntry, HybridInsight } from "./types";

const DAY = 86400;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 认知杂交（Phase 3，受控）：仅在命令触发。取 >30 天的旧化石随机 2~3 个，
 * 由 LLM 产出"灵感合成"（非结论），默认低权、需用户确认才升权。
 */
export async function runHybridization(
  app: App,
  folderName: string,
  provider: LLMProvider | null,
  entries: SedimentIndexEntry[],
  s: LLMChatSettings,
  now: number = Date.now()
): Promise<HybridInsight[]> {
  const old = entries.filter(
    (e) => e.status === "active" && now / 1000 - e.timestamp > HYBRID_OLD_DAYS * DAY
  );
  if (old.length < 2 || !provider) return [];
  const picks = shuffle([...old]).slice(0, Math.min(HYBRID_PICK, old.length));
  const sample = picks
    .map((e) => `- ${e.topic}（${e.facies || "?"} / ${e.stance || "?"}）[id:${e.id}]`)
    .join("\n");
  const prompt =
    `以下是从你过去沉积层中随机抽取、相隔 30 天以上的几条认知节点。\n` +
    `请做一个"受控灵感杂交"：找出它们之间非显而易见的联系，产出 1~2 条灵感合成（是启发而非结论）。\n` +
    `仅输出 JSON：{"insights":[{"title":string,"synthesis":string,"node_ids":[string]}]}\n` +
    `节点：\n${sample}`;
  const res = await callJSON<{
    insights: { title: string; synthesis: string; node_ids: string[] }[];
  }>(provider, prompt);
  if (!res || !Array.isArray(res.insights) || !res.insights.length) return [];
  const existing = (await readJson<HybridInsight[]>(app, folderName, "hybrids")) || [];
  const weight = s.sedimentWeight.survival * HYBRID_LOW_WEIGHT_FACTOR;
  const created: HybridInsight[] = res.insights.map((it) => ({
    id: `hyb_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    title: it.title || "未命名灵感",
    synthesis: it.synthesis || "",
    node_ids: (it.node_ids || []).filter((id) => picks.some((p) => p.id === id)),
    weight,
    confirmed: false,
    created: now,
  }));
  await writeJson(app, folderName, "hybrids", [...existing, ...created]);
  return created;
}
