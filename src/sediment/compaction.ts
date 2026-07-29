import { App } from "obsidian";
import type { LLMChatSettings } from "../settings";
import type { LLMProvider } from "../llm/index";
import { callJSON } from "./core/llm-json";
import { readJson, writeJson } from "./storage/derived-store";
import { COMPACTION_MIN_MEMBERS } from "./constants";
import type {
  SedimentIndexEntry,
  CompactionManifest,
  CompactionRecord,
} from "./types";

const DAY = 86400;

/**
 * 周期性压实（Phase 3）：每 sedimentCompactionDays 天，把早于 sedimentCompactionMinAgeDays 天的
 * 旧化石压实成一个独立派生摘要。化石内容原样保留（不可变），仅把被摘要覆盖的旧化石在索引中标记 superseded。
 * 返回本次压实记录；未到期或无足够候选则返回 null。
 */
export async function maybeCompact(
  app: App,
  folderName: string,
  provider: LLMProvider | null,
  entries: SedimentIndexEntry[],
  s: LLMChatSettings,
  now: number = Date.now()
): Promise<{ record: CompactionRecord | null; supersededIds: string[] }> {
  const manifest: CompactionManifest =
    (await readJson<CompactionManifest>(app, folderName, "compaction_manifest")) || {
      lastCompact: null,
    };
  const intervalSec = s.sedimentCompactionDays * DAY;
  if (manifest.lastCompact && now / 1000 - manifest.lastCompact < intervalSec) {
    return { record: null, supersededIds: [] };
  }
  const minAgeSec = s.sedimentCompactionMinAgeDays * DAY;
  const cands = entries.filter(
    (e) => e.status === "active" && now / 1000 - e.timestamp > minAgeSec
  );
  if (cands.length < COMPACTION_MIN_MEMBERS || !provider) {
    await writeJson(app, folderName, "compaction_manifest", {
      lastCompact: Math.floor(now / 1000),
    });
    return { record: null, supersededIds: [] };
  }
  const sample = cands
    .slice(0, 30)
    .map((e) => `- ${e.topic}（${e.facies || "?"} / ${e.stance || "?"}）`)
    .join("\n");
  const prompt =
    `以下是一批较早的沉积层认知节点，请压实为一份简明派生摘要：\n` +
    `1) summary：对这批记忆的整体概括；2) key_tenets：3~6 条仍站得住的核心命题；` +
    `3) superseded_ids：其中已被时代淘汰、可标记为 superseded 的旧节点 id（只填 id）。\n` +
    `仅输出 JSON：{"summary":string,"key_tenets":[string],"superseded_ids":[string]}\n` +
    `节点：\n${sample}`;
  const res = await callJSON<{
    summary: string;
    key_tenets: string[];
    superseded_ids: string[];
  }>(provider, prompt);
  const d = new Date(now);
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const supersededIds =
    res && Array.isArray(res.superseded_ids)
      ? res.superseded_ids.filter((id) => cands.some((c) => c.id === id))
      : [];
  const record: CompactionRecord = {
    id: `comp_${Date.now().toString(36)}`,
    period,
    summary: res && res.summary ? res.summary : "",
    key_tenets: res && Array.isArray(res.key_tenets) ? res.key_tenets : [],
    member_ids: cands.map((c) => c.id),
    superseded_ids: supersededIds,
    created: now,
  };
  await writeJson(app, folderName, `compaction-${period}`, record);
  await writeJson(app, folderName, "compaction_manifest", {
    lastCompact: Math.floor(now / 1000),
  });
  return { record, supersededIds };
}
