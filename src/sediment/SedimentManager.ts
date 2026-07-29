import { App, Notice, normalizePath, TFile } from "obsidian";
import {
  FilterResult,
  SedimentIndexEntry,
  Facies,
  Stance,
  BedrockTenet,
  FaultRecord,
  InjectionContext,
  WormholeHit,
  HybridInsight,
} from "./types";
import { L1Writer } from "./storage/l1-writer";
import { IndexManager } from "./storage/index-manager";
import { I18N } from "./SedimentManager";
import { DailyBriefing } from "./briefing/daily-briefing";
import { SedimentIndicator } from "./status-bar/sediment-indicator";
import { applyGravityFilter } from "./filter/gravity-rules";
import { LLMChatSettings } from "../settings";
import { LLMProvider } from "../llm/index";
import { CognitiveNode } from "./capture-extractor";
import { projectLayer } from "./core/projection";
import { rankScore } from "./core/rank";
import { computeSurvival } from "./core/survival";
import { MetamorphEngine } from "./metamorph";
import { FaultDetector } from "./fault-detector";
import { extractNumericTokens, conflictingTokens, topicOverlap } from "./contradiction-prescreen";
import { VeinEngine } from "./vein";
import { ContextInjector } from "./context-injector";
import { Wormhole } from "./wormhole";
import { runHybridization } from "./hybridize";
import { maybeCompact } from "./compaction";
import { HYBRID_CONFIRM_BOOST } from "./constants";
import { readJson, writeJson } from "./storage/derived-store";

export const I18N = {
  statusBarIdle: "沉积层活跃",
  statusBarDeposit: (n: number) => `今日 +${n}`,
  statusBarConflict: (n: number) => `断层 ${n}`,
  statusBarFull: (fossil: number, fault: number, vein: number, wormhole = 0, hybrid = 0) =>
    `💎 ${fossil} · 断层 ${fault} · 矿脉 ${vein}` +
    (wormhole ? ` · 🪱 ${wormhole}` : "") +
    (hybrid ? ` · 💡 ${hybrid}` : ""),
  briefingTitle: (date: string) => `沉积层日报（${date}）`,
};

export interface SedimentManagerConfig {
  folderName?: string;
  deviceName?: string;
  isEnabled?: boolean | (() => boolean);
  isBriefingEnabled?: boolean | (() => boolean);
  settings: LLMChatSettings;
}

export class SedimentManager {
  private app: App;
  public indicator: SedimentIndicator | null;
  private folderName: string;
  private deviceName: string;
  private isEnabled: () => boolean;
  private isBriefingEnabled: () => boolean;
  private settings: LLMChatSettings;
  private l1Writer: L1Writer;
  private indexManager: IndexManager;
  private briefing: DailyBriefing;
  private metamorph: MetamorphEngine;
  private faultDetector: FaultDetector;
  private vein: VeinEngine;
  private injector: ContextInjector;
  private provider: LLMProvider | null = null;
  private analysisEnabled = false;
  private decayTimer: ReturnType<typeof setInterval> | null = null;
  private todayCount = 0;
  private faultCount = 0;
  private veinCount = 0;
  private wormhole: Wormhole | null = null;
  private wormholeCount = 0;
  private hybridCount = 0;

  constructor(app: App, indicator: SedimentIndicator | null, config: SedimentManagerConfig) {
    this.app = app;
    this.indicator = indicator;
    this.folderName = config.folderName || ".sediment";
    this.deviceName = config.deviceName || "default";
    this.isEnabled =
      typeof config.isEnabled === "function"
        ? (config.isEnabled as () => boolean)
        : () => config.isEnabled !== false;
    this.isBriefingEnabled =
      typeof config.isBriefingEnabled === "function"
        ? (config.isBriefingEnabled as () => boolean)
        : () => config.isBriefingEnabled !== false;
    this.settings = config.settings;
    this.l1Writer = new L1Writer(app, { folderName: this.folderName });
    this.indexManager = new IndexManager(app, { folderName: this.folderName });
    this.briefing = new DailyBriefing(app, this.l1Writer, this.indexManager, {
      outputDir: `${this.folderName}/briefings`,
      deviceName: this.deviceName,
      folderName: this.folderName,
    });
    this.metamorph = new MetamorphEngine(app, this.folderName);
    this.faultDetector = new FaultDetector(app, this.folderName);
    this.vein = new VeinEngine(app, this.folderName);
    this.injector = new ContextInjector();
    this.wormhole = new Wormhole(
      app,
      this.folderName,
      () => this.provider,
      () => this.indexManager.getAll(),
      () => this.settings.enableSedimentWormhole,
      undefined,
      (hits) => {
        this.wormholeCount = hits.length;
        this.statusBarUpdate();
      }
    );
    this.wormhole.start();
    this.updateIndicatorVisibility();
  }

  updateSettings(s: LLMChatSettings): void {
    this.settings = s;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  setAnalysisEnabled(v: boolean): void {
    this.analysisEnabled = v;
    if (v) {
      void this.runAnalysisPass();
      if (!this.decayTimer) {
        this.decayTimer = setInterval(() => this.decayDaily(), 24 * 3600 * 1000);
      }
    } else if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
  }

  private buildL1Path(id: string): string {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(
      2,
      "0"
    )}${String(d.getSeconds()).padStart(2, "0")}`;
    return normalizePath(`${this.folderName}/L1/${date}/${time}_${id}.md`);
  }

  /** 终答后台沉积（带 LLM 抽得的认知节点） */
  async depositTurn(
    userText: string,
    assistantText: string,
    nodes: CognitiveNode[] | null
  ): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const content = `[用户] ${userText}\n\n[助手] ${assistantText}`;
    const fr: FilterResult = applyGravityFilter(content);
    if (fr.action !== "record") return false;
    const id = `s_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const topic = nodes && nodes.length ? nodes[0].content.slice(0, 40) : userText.slice(0, 40);
    const facies = nodes && nodes.length ? (nodes[0].facies as Facies) : undefined;
    const stance = nodes && nodes.length ? (nodes[0].stance as Stance) : undefined;
    const path = await this.l1Writer.deposit(content, topic);
    if (!path) return false;
    const entry: SedimentIndexEntry = {
      id,
      layer: "L1",
      timestamp: Math.floor(Date.now() / 1000),
      survival_score: 0.5,
      novelty_score: 1,
      explore_boost: 0,
      status: "active",
      topic,
      source_file: path,
      citation_count: 0,
      retrieval_count: 0,
      facies,
      stance,
      cross_cutting: [],
    };
    await this.indexManager.addEntry(entry);
    this.todayCount++;
    this.statusBarUpdate();
    return true;
  }

  /** 手动/兼容入口（无 LLM）；ManualSedimentModal 调用 */
  async processContent(overflow: string, topic?: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const fr: FilterResult = applyGravityFilter(overflow);
    if (fr.action !== "record") return false;
    const id = `s_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const t = topic || overflow.slice(0, 40);
    const path = await this.l1Writer.deposit(overflow, t);
    if (!path) return false;
    const entry: SedimentIndexEntry = {
      id,
      layer: "L1",
      timestamp: Math.floor(Date.now() / 1000),
      survival_score: 0.5,
      novelty_score: 1,
      explore_boost: 0,
      status: "active",
      topic: t,
      source_file: path,
      citation_count: 0,
      retrieval_count: 0,
      cross_cutting: [],
    };
    await this.indexManager.addEntry(entry);
    this.todayCount++;
    this.statusBarUpdate();
    return true;
  }

  /** 反差注入上下文（仅分析开启时返回） */
  buildInjectionContext(): InjectionContext | null {
    if (!this.analysisEnabled) return null;
    const entries = this.indexManager.getAll();
    if (!entries.length) return null;
    return this.injector.buildContext(entries, this.settings);
  }

  /** 后台分析 pass：变质 + 断层 + 矿脉 + 计数更新 */
  async runAnalysisPass(): Promise<void> {
    if (!this.analysisEnabled) return;
    const entries = await this.indexManager.load();
    if (!entries.length) return;
    await this.metamorph.metamorph(entries, this.settings, this.provider);
    const faults = await this.faultDetector.detect(entries, this.settings, this.provider);
    const veins = this.vein.clusterRelated(entries, this.settings);

    // 矛盾预筛（借 MemPalace 零 LLM 硬事实校验）：即使无 LLM 也能先打低级矛盾
    const prescreened = await this.runContradictionPrescreen(entries);

    const allNew = [...faults, ...prescreened];
    for (const f of allNew) {
      await this.indexManager.updateEntry(f.a_id, { cross_cutting: [f.id] });
      await this.indexManager.updateEntry(f.b_id, { cross_cutting: [f.id] });
    }
    this.faultCount = allNew.filter((f) => f.status === "open").length;
    this.veinCount = veins.length;
    this.statusBarUpdate();
    // 周期性压实随深度分析 pass 自动运行（到期才写派生摘要）
    await this.runCompactionPass();
  }

  /** rebuild 命令后重算派生态（存活率/新颖度/探索加成） */
  async recomputeDerivedState(): Promise<void> {
    const entries = await this.indexManager.load();
    for (const e of entries) {
      const { survival, novelty, explore_boost } = computeSurvival(e, this.settings);
      // 视图层按 age 动态计算（化石不可变，分层是投影）
      const layer = projectLayer(e.timestamp * 1000, Date.now(), this.settings);
      await this.indexManager.updateEntry(e.id, {
        survival_score: survival,
        novelty_score: novelty,
        explore_boost,
        layer,
      });
    }
  }

  private decayDaily(): void {
    void (async () => {
      const entries = await this.indexManager.load();
      const factor = this.settings.sedimentDecay.dailyFactor;
      for (const e of entries) {
        await this.indexManager.updateEntry(e.id, {
          retrieval_count: Math.floor(e.retrieval_count * factor),
        });
      }
    })();
  }

  async rebuildIndex(): Promise<void> {
    const entries = await this.indexManager.rebuildFromMarkdown();
    await this.indexManager.save(entries);
    await this.recomputeDerivedState();
    const todayStart = this.startOfToday();
    this.todayCount = entries.filter((e) => e.timestamp * 1000 >= todayStart).length;
    this.statusBarUpdate();
  }

  private startOfToday(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  async tryGenerateBriefing(): Promise<boolean> {
    if (!this.isBriefingEnabled()) return false;
    return await this.briefing.tryGenerate();
  }

  private updateIndicatorVisibility(): void {
    this.indicator?.setEnabled(this.isEnabled());
  }

  private statusBarUpdate(): void {
    this.indicator?.setCounts(
      this.todayCount,
      this.faultCount,
      this.veinCount,
      this.wormholeCount,
      this.hybridCount
    );
  }

  onunload(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
    this.wormhole?.stop();
  }

  // —— 命令/弹窗支持 ——
  async getOpenFaults(): Promise<FaultRecord[]> {
    const all = (await readJson<FaultRecord[]>(this.app, this.folderName, "faults")) || [];
    return all.filter((f) => f.status === "open");
  }

  private async writeTenet(tension: string, assertion: string, sourceIds: string[]): Promise<BedrockTenet> {
    const id = `tenet_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const now = Date.now();
    const path = normalizePath(`${this.folderName}/bedrock/${id}.md`);
    const fm =
      `---\n` +
      `id: ${id}\n` +
      `type: bedrock\n` +
      `tension: ${tension.replace(/\n/g, " ")}\n` +
      `assertion: ${assertion.replace(/\n/g, " ")}\n` +
      `source_ids: [${sourceIds.join(", ")}]\n` +
      `status: open\n` +
      `created: ${now}\n` +
      `updated: ${now}\n` +
      `weight: ${this.settings.sedimentWeight.survival * 0.3}\n` +
      `---\n`;
    const dir = normalizePath(`${this.folderName}/bedrock`);
    if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.createFolder(dir);
    await this.app.vault.adapter.write(path, fm);
    const tenet: BedrockTenet = {
      id, path, tension, assertion, source_ids: sourceIds,
      status: "open", created: now, updated: now,
      weight: this.settings.sedimentWeight.survival * 0.3,
    };
    const idx = (await readJson<BedrockTenet[]>(this.app, this.folderName, "bedrock_index")) || [];
    await writeJson(this.app, this.folderName, "bedrock_index", [...idx, tenet]);
    return tenet;
  }

  /** 裁决断层：生成/关联张力命题并标记 adjudicated */
  async adjudicateFault(faultId: string, tension: string, assertion: string): Promise<void> {
    const tenet = await this.writeTenet(tension, assertion, []);
    const all = (await readJson<FaultRecord[]>(this.app, this.folderName, "faults")) || [];
    const next = all.map((f) =>
      f.id === faultId ? { ...f, status: "adjudicated" as const, resolved_by: tenet.id } : f
    );
    await writeJson(this.app, this.folderName, "faults", next);
    this.faultCount = next.filter((f) => f.status === "open").length;
    this.statusBarUpdate();
  }

  /** 标记断层无关（仅标记 resolved，不生成 tenet） */
  async dismissFault(faultId: string): Promise<void> {
    const all = (await readJson<FaultRecord[]>(this.app, this.folderName, "faults")) || [];
    const next = all.map((f) =>
      f.id === faultId ? { ...f, status: "adjudicated" as const } : f
    );
    await writeJson(this.app, this.folderName, "faults", next);
    this.faultCount = next.filter((f) => f.status === "open").length;
    this.statusBarUpdate();
  }

  async getUnconfirmedVeins(): Promise<{ id: string; label: string }[]> {
    const all = (await readJson<{ id: string; label: string; confirmed: boolean }[]>(
      this.app,
      this.folderName,
      "veins"
    )) || [];
    return all.filter((v) => !v.confirmed).map((v) => ({ id: v.id, label: v.label }));
  }

  async confirmVein(veinId: string): Promise<void> {
    await this.vein.confirm(veinId);
    const veins = await this.vein.load();
    this.veinCount = veins.length;
    this.statusBarUpdate();
  }

  // —— Phase 3 主动进化 ——

  /** 加载实时虫洞对照记录（落盘 / 内存），刷新状态栏 🪱 计数 */
  async loadWormholeHits(): Promise<WormholeHit[]> {
    if (!this.wormhole) return [];
    const hits = await this.wormhole.loadPersisted();
    this.wormholeCount = hits.length;
    this.statusBarUpdate();
    return hits;
  }

  /** 认知杂交 pass：仅命令触发，生成默认低权灵感 */
  async runHybridizationPass(): Promise<number> {
    if (!this.analysisEnabled || !this.provider) {
      new Notice("认知杂交需先开启「沉积层深度分析」并配置 LLM Provider");
      return 0;
    }
    const entries = this.indexManager.getAll();
    const created = await runHybridization(
      this.app,
      this.folderName,
      this.provider,
      entries,
      this.settings
    );
    if (created.length) {
      new Notice(`💡 认知杂交生成 ${created.length} 条灵感（默认低权，需确认升权）`);
    } else {
      new Notice("认知杂交：暂无可杂交的旧节点（需 >30 天且 ≥2 条）");
    }
    this.hybridCount = (await this.getUnconfirmedHybrids()).length;
    this.statusBarUpdate();
    return created.length;
  }

  async getUnconfirmedHybrids(): Promise<HybridInsight[]> {
    const all = (await readJson<HybridInsight[]>(this.app, this.folderName, "hybrids")) || [];
    return all.filter((h) => !h.confirmed);
  }

  /** 标「有启发」升权：灵感权重翻倍（封顶 1），来源节点探索加成 +0.2 */
  async confirmHybrid(id: string): Promise<void> {
    const all = (await readJson<HybridInsight[]>(this.app, this.folderName, "hybrids")) || [];
    let target: HybridInsight | undefined;
    const next = all.map((h) => {
      if (h.id !== id) return h;
      target = h;
      const w = Math.min(1, h.weight * HYBRID_CONFIRM_BOOST);
      return { ...h, confirmed: true, weight: w };
    });
    await writeJson(this.app, this.folderName, "hybrids", next);
    if (target) {
      for (const nid of target.node_ids) {
        const e = this.indexManager.getAll().find((x) => x.id === nid);
        if (e) {
          await this.indexManager.updateEntry(nid, {
            explore_boost: Math.min(1, e.explore_boost + 0.2),
          });
        }
      }
    }
    this.hybridCount = next.filter((h) => !h.confirmed).length;
    this.statusBarUpdate();
  }

  /** 周期性压实：到期才写独立派生摘要，化石内容不可变（仅标 superseded） */
  async runCompactionPass(): Promise<void> {
    if (!this.analysisEnabled || !this.provider) return;
    const entries = this.indexManager.getAll();
    const { record, supersededIds } = await maybeCompact(
      this.app,
      this.folderName,
      this.provider,
      entries,
      this.settings
    );
    if (record) {
      for (const sid of supersededIds) {
        await this.indexManager.updateEntry(sid, { status: "superseded" });
      }
      new Notice(
        `🪨 沉积层压实完成（${record.period}，覆盖 ${record.member_ids.length} 条旧化石）`
      );
    }
  }

  /** 矛盾预筛：对最近 1 小时新化石做确定性数字/日期比对，零 LLM 产出候选断层 */
  private async runContradictionPrescreen(entries: SedimentIndexEntry[]): Promise<FaultRecord[]> {
    const nowSec = Math.floor(Date.now() / 1000);
    const recent = entries.filter((e) => e.source_file && e.timestamp > nowSec - 3600);
    if (!recent.length) return [];
    const existing = (await readJson<FaultRecord[]>(this.app, this.folderName, "faults")) || [];
    const openCount = existing.filter((f) => f.status === "open").length;
    const room = Math.max(0, this.settings.sedimentCaps.faultPerDay - openCount);
    if (room <= 0) return [];

    const out: FaultRecord[] = [];
    for (const r of recent) {
      if (out.length >= room) break;
      let rText = "";
      try {
        rText = await this.app.vault.adapter.read(r.source_file);
      } catch {
        continue;
      }
      const rTokens = extractNumericTokens(rText);
      if (!rTokens.length) continue;
      for (const o of entries) {
        if (o.id === r.id || !o.source_file) continue;
        if (o.timestamp >= r.timestamp) continue;
        if (!topicOverlap(r.topic, o.topic)) continue;
        let oText = "";
        try {
          oText = await this.app.vault.adapter.read(o.source_file);
        } catch {
          continue;
        }
        const conflicts = conflictingTokens(rTokens, extractNumericTokens(oText));
        if (conflicts.length) {
          out.push({
            id: this.genFaultId(),
            a_id: o.id,
            b_id: r.id,
            kind: "factual",
            summary: `疑似事实矛盾（数字/日期冲突）：${conflicts.join("；")}`,
            status: "open",
            created: Date.now(),
            prescreen: true,
          });
          if (out.length >= room) break;
        }
      }
    }
    if (out.length) await writeJson(this.app, this.folderName, "faults", [...existing, ...out]);
    return out;
  }

  private genFaultId(): string {
    return "flt_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  /** 事实演化时间线（借 MemPalace 时序知识图）：按主题汇总断层/演化，生成可读 Markdown */
  async generateEvolutionTimeline(): Promise<void> {
    await this.ensureSedimentFolder();
    const faults = (await readJson<FaultRecord[]>(this.app, this.folderName, "faults")) || [];
    const entries = await this.indexManager.load();
    const byTopic = new Map<string, string[]>();
    for (const f of faults) {
      const a = entries.find((e) => e.id === f.a_id);
      const b = entries.find((e) => e.id === f.b_id);
      const topic = (a?.topic || b?.topic || "未命名主题").trim();
      const time = new Date(f.created).toISOString().slice(0, 10);
      const tag = f.prescreen ? "预筛" : "断层";
      const st = f.status === "adjudicated" ? "已裁决" : "待裁决";
      const arr = byTopic.get(topic) || [];
      arr.push(`- ${time} [${tag}] ${f.summary}（${st}）`);
      byTopic.set(topic, arr);
    }
    const lines: string[] = [
      "# 沉积层事实演化时间线",
      "",
      "_按主题汇总的历史观点冲突与演化；开启深度分析后编辑笔记会逐步积累。_",
      "",
    ];
    if (byTopic.size === 0) lines.push("_暂无记录。_");
    for (const [topic, items] of byTopic) {
      lines.push(`## ${topic}`, ...items, "");
    }
    const content = lines.join("\n");
    const path = normalizePath(`${this.folderName}/evolution-timeline.md`);
    await this.app.vault.adapter.write(path, content);
    new Notice("已生成事实演化时间线（.sediment/evolution-timeline.md）");
  }

  private async ensureSedimentFolder(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(this.folderName);
    } catch {
      // 已存在则忽略
    }
  }
}
