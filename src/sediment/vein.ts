// 矿脉引擎：按 topic 聚类（替代随机杂交），产物默认低权、需确认升权
import { App } from "obsidian";
import { SedimentIndexEntry, VeinRecord } from "./types";
import { LLMChatSettings } from "../settings";
import { VEIN_LOW_WEIGHT } from "./constants";
import { readJson, writeJson } from "./storage/derived-store";

export class VeinEngine {
  constructor(private app: App, private folderName: string) {}

  private genId(): string {
    return `vein_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  /** 确定性聚类（不调用 LLM）。返回本次产出的矿脉 */
  clusterRelated(entries: SedimentIndexEntry[], s: LLMChatSettings): VeinRecord[] {
    const clusters = new Map<string, SedimentIndexEntry[]>();
    for (const e of entries) {
      const key = (e.topic || "").trim().toLowerCase();
      if (!key) continue;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(e);
    }
    const out: VeinRecord[] = [];
    for (const [key, members] of clusters) {
      if (members.length < s.sedimentMetamorph.n) continue;
      out.push({
        id: this.genId(),
        member_ids: members.map((m) => m.id),
        label: members[0].topic,
        survival_score: s.sedimentWeight.survival * VEIN_LOW_WEIGHT,
        confirmed: false,
        created: Date.now(),
      });
    }
    if (out.length > 0) {
      void writeJson(this.app, this.folderName, "veins", out);
    }
    return out;
  }

  async load(): Promise<VeinRecord[]> {
    return (await readJson<VeinRecord[]>(this.app, this.folderName, "veins")) || [];
  }

  async confirm(id: string): Promise<void> {
    const all = await this.load();
    const next = all.map((v) => (v.id === id ? { ...v, confirmed: true, survival_score: Math.max(v.survival_score, 0.7) } : v));
    await writeJson(this.app, this.folderName, "veins", next);
  }
}
