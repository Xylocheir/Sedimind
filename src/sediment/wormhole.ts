import { App, Notice, TFile } from "obsidian";
import type { LLMChatSettings } from "../settings";
import type { LLMProvider } from "../llm/index";
import { callJSON } from "./core/llm-json";
import { readJson, writeJson } from "./storage/derived-store";
import { contrastScoreFor } from "./core/contrast";
import {
  WORMHOLE_COOLDOWN_MS,
  WORMHOLE_MAX_NOTE_BYTES,
  WORMHOLE_SAMPLE_ENTRIES,
} from "./constants";
import type { SedimentIndexEntry, WormholeHit, WormholeRelation } from "./types";

const REL_LABEL: Record<WormholeRelation, string> = {
  contradiction: "矛盾",
  resonance: "呼应",
  evolution: "演化",
};

/**
 * 实时虫洞（Phase 3）：编辑 vault 笔记时，后台语义比对沉积层认知节点，
 * 弹窗提示「矛盾 / 呼应 / 演化」对照。侵入式能力，默认关闭；
 * 仅扫描非沉积层 md 文件，回写派生 JSON 不会触发死循环。
 */
export class Wormhole {
  private app: App;
  private folderName: string;
  private getProvider: () => LLMProvider | null;
  private getEntries: () => SedimentIndexEntry[];
  private isEnabled: () => boolean;
  private cooldownMs: number;
  private onHits?: (hits: WormholeHit[]) => void;

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastRun = new Map<string, number>();
  private lastHits: WormholeHit[] = [];
  private eventRef: { (...args: unknown[]): unknown } | null = null;

  constructor(
    app: App,
    folderName: string,
    getProvider: () => LLMProvider | null,
    getEntries: () => SedimentIndexEntry[],
    isEnabled: () => boolean,
    cooldownMs = WORMHOLE_COOLDOWN_MS,
    onHits?: (hits: WormholeHit[]) => void
  ) {
    this.app = app;
    this.folderName = folderName;
    this.getProvider = getProvider;
    this.getEntries = getEntries;
    this.isEnabled = isEnabled;
    this.cooldownMs = cooldownMs;
    this.onHits = onHits;
  }

  start(): void {
    this.eventRef = this.app.vault.on("modify", (file: TFile) =>
      this.onModify(file)
    );
  }

  stop(): void {
    if (this.eventRef) {
      this.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private onModify(file: TFile): void {
    if (file.extension !== "md") return;
    if (file.path.includes(this.folderName)) return; // 不扫描沉积层自身，防回写死循环
    if (!this.isEnabled() || !this.getProvider()) return;
    const now = Date.now();
    const last = this.lastRun.get(file.path) || 0;
    if (now - last < this.cooldownMs) return;
    const existing = this.timers.get(file.path);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      this.timers.delete(file.path);
      this.lastRun.set(file.path, Date.now());
      void this.scan(file.path);
    }, this.cooldownMs);
    this.timers.set(file.path, handle);
  }

  private async scan(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    if (file.stat.size > WORMHOLE_MAX_NOTE_BYTES) return;
    const provider = this.getProvider();
    if (!provider) return;
    const entries = this.getEntries();
    if (!entries.length) return;
    // 优先注入高反差度的旧认知节点作为对照锚
    const sample = [...entries]
      .sort((a, b) => contrastScoreFor(b) - contrastScoreFor(a))
      .slice(0, WORMHOLE_SAMPLE_ENTRIES)
      .map((e) => `- ${e.topic}（${e.facies || "?"} / ${e.stance || "?"}）`)
      .join("\n");
    const noteText = (await this.app.vault.read(file)).slice(0, 4000);
    const prompt =
      `你正在对照用户正在编辑的笔记与他的"沉积层"记忆（过去对话沉淀的认知节点）。\n` +
      `沉积层样本：\n${sample}\n\n` +
      `用户笔记内容（前 4000 字）：\n${noteText}\n\n` +
      `请找出笔记与沉积层之间最值得提醒的对照，最多 3 条。仅输出 JSON：` +
      `{"hits":[{"relation":"contradiction|resonance|evolution","note_excerpt":string,"sediment_excerpt":string,"explanation":string}]}`;
    const res = await callJSON<{
      hits: {
        relation: WormholeRelation;
        note_excerpt: string;
        sediment_excerpt: string;
        explanation: string;
      }[];
    }>(provider, prompt);
    if (res && Array.isArray(res.hits) && res.hits.length) {
      const hits: WormholeHit[] = res.hits.map((h) => ({
        id: `wh_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
        relation: h.relation,
        note_excerpt: h.note_excerpt,
        sediment_excerpt: h.sediment_excerpt,
        explanation: h.explanation,
        created: Date.now(),
      }));
      this.lastHits = hits;
      await writeJson(this.app, this.folderName, "wormhole_hits", hits);
      this.onHits?.(hits);
      new Notice(
        `🪱 虫洞：${hits.map((h) => REL_LABEL[h.relation]).join("、")} ${hits.length} 处`
      );
    }
  }

  getHits(): WormholeHit[] {
    return this.lastHits;
  }

  async loadPersisted(): Promise<WormholeHit[]> {
    const h = await readJson<WormholeHit[]>(this.app, this.folderName, "wormhole_hits");
    this.lastHits = h || [];
    return this.lastHits;
  }
}
