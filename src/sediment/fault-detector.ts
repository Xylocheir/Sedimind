// 断层线检测：同 topic 且立场对立的化石成对 → FaultRecord（冲突可视化）
import { App } from "obsidian";
import { SedimentIndexEntry, FaultRecord } from "./types";
import { LLMChatSettings } from "../settings";
import { LLMProvider } from "../llm/index";
import { callJSON } from "./core/llm-json";
import { readJson, writeJson } from "./storage/derived-store";

export class FaultDetector {
  constructor(private app: App, private folderName: string) {}

  private genId(): string {
    return `fault_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  private isOpposing(a?: string, b?: string): boolean {
    const set = new Set([a, b]);
    return set.has("pro") && set.has("con");
  }

  async detect(
    entries: SedimentIndexEntry[],
    s: LLMChatSettings,
    provider: LLMProvider | null
  ): Promise<FaultRecord[]> {
    const candidates: SedimentIndexEntry[] = entries.filter(
      (e) => e.topic && (e.stance === "pro" || e.stance === "con")
    );
    const existing = (await readJson<FaultRecord[]>(this.app, this.folderName, "faults")) || [];
    const cap = s.sedimentCaps.faultPerDay;
    const out: FaultRecord[] = [];
    let daily = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (daily >= cap) break;
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (!this.isOpposing(a.stance, b.stance)) continue;
        if ((a.topic || "").trim().toLowerCase() !== (b.topic || "").trim().toLowerCase()) continue;

        let kind: FaultRecord["kind"] = "factual";
        let summary = `「${a.topic}」：一条支持、一条反对`;
        if (provider) {
          const prompt =
            `两条关于「${a.topic}」的沉积相互冲突，判断冲突类型与一句话摘要。\n` +
            `A(${a.stance}): ${a.topic}\nB(${b.stance}): ${b.topic}\n` +
            `只输出 JSON {kind:"factual|preference|plan", summary}。`;
          const r = await callJSON(provider, prompt);
          if (r && r.kind) kind = r.kind;
          if (r && typeof r.summary === "string") summary = r.summary;
        }
        const id = this.genId();
        out.push({
          id, a_id: a.id, b_id: b.id, kind, summary, status: "open", created: Date.now(),
        });
        daily++;
        if (daily >= cap) break;
      }
    }

    if (out.length > 0) {
      await writeJson(this.app, this.folderName, "faults", [...existing, ...out]);
    }
    return out;
  }
}
