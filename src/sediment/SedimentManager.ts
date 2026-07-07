import { App, Notice, TFile, normalizePath } from "obsidian";
import { SedimentIndicator } from "./status-bar/sediment-indicator";
import { L1Writer } from "./storage/l1-writer";
import { IndexManager } from "./storage/index-manager";
import { DailyBriefing } from "./briefing/daily-briefing";
import { applyGravityFilter } from "./filter/gravity-rules";
import { SedimentIndexEntry } from "./types";

/** Phase 1 文案集中定义（状态栏 + 简报标题），后续可接入 i18n。 */
export const I18N = {
  statusBarIdle: "🪨 沉积层活跃",
  statusBarDeposit: (n: number) => `🪨 沉积层: 今日 +${n}`,
  statusBarConflict: (n: number) => `⚡ 沉积层: ${n} 处断层待观察`,
  briefingTitle: (date: string) => `🪨 沉积层日报 — ${date}`,
};

export interface SedimentManagerConfig {
  folderName?: string;
  deviceName?: string;
  /** 实时读取总开关状态（默认 true） */
  isEnabled?: () => boolean;
  /** 实时读取「每日简报」子开关状态（默认 true） */
  isBriefingEnabled?: () => boolean;
}

export class SedimentManager {
  private app: App;
  private indicator: SedimentIndicator;
  private l1Writer: L1Writer;
  private indexManager: IndexManager;
  private dailyBriefing: DailyBriefing;
  private folderName: string;
  private deviceName: string;
  private isEnabledFn: () => boolean;
  private isBriefingEnabledFn: () => boolean;
  private todayCount = 0;
  private todayKey = "";
  private lastContent: string | undefined;

  private pendingEntries: SedimentIndexEntry[] = [];
  private debounceTimer: number | null = null;

  constructor(
    app: App,
    indicator: SedimentIndicator,
    config?: SedimentManagerConfig
  ) {
    this.app = app;
    this.indicator = indicator;
    this.folderName = (config && config.folderName) || ".sediment";
    this.deviceName = (config && config.deviceName) || "default";
    this.isEnabledFn = (config && config.isEnabled) ? config.isEnabled : () => true;
    this.isBriefingEnabledFn = (config && config.isBriefingEnabled) ? config.isBriefingEnabled : () => true;
    this.l1Writer = new L1Writer(app, { folderName: this.folderName });
    this.indexManager = new IndexManager(app, { folderName: this.folderName });
    this.dailyBriefing = new DailyBriefing(app, this.l1Writer, this.indexManager, {
      outputDir: `${this.folderName}/briefings`,
      deviceName: this.deviceName,
    });
    this.resetTodayIfNeeded();
    this.indicator.setTodayCount(this.todayCount);
    this.indicator.onClick(() => {
      this.openBriefing();
    });
    this.updateIndicatorVisibility();
  }

  /** 重力筛选入口：被蒸发返回 false，否则写入 L1 并刷新索引/状态栏 */
  async processContent(content: string, topic?: string): Promise<boolean> {
    if (!this.isEnabledFn()) return false;
    const result = applyGravityFilter(content, this.lastContent);
    this.lastContent = content;
    if (result.action === "evaporate") {
      return false;
    }
    const filePath = await this.l1Writer.deposit(content, topic, {
      filter_result: result.action,
    });
    if (!filePath) return false;

    const id = filePath.split("/").pop()!.replace(/\.md$/, "");
    const label = (topic && topic.trim() ? topic.trim() : content.trim())
      .replace(/[\\/:?"<>|]/g, "")
      .slice(0, 20)
      .trim();
    const entry: SedimentIndexEntry = {
      id,
      layer: "L1",
      timestamp: Math.floor(Date.now() / 1000),
      survival_score: result.action === "mark_high" ? 0.8 : 0.5,
      novelty_score: 1.0,
      explore_boost: 0.0,
      status: "active",
      topic: label,
      source_file: filePath,
      citation_count: 0,
      retrieval_count: 0,
    };
    this.scheduleIndexAdd(entry);
    this.resetTodayIfNeeded();
    this.todayCount += 1;
    this.indicator.setTodayCount(this.todayCount);
    return true;
  }

  /** 索引写入（500ms 防抖合并） */
  private scheduleIndexAdd(entry: SedimentIndexEntry): void {
    this.pendingEntries.push(entry);
    if (this.debounceTimer !== null) return;
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.flushIndex();
    }, 500);
  }

  private async flushIndex(): Promise<void> {
    if (this.pendingEntries.length === 0) return;
    const entries = await this.indexManager.load();
    const map = new Map(entries.map((e) => [e.id, e]));
    for (const e of this.pendingEntries) map.set(e.id, e);
    const merged = Array.from(map.values());
    this.pendingEntries = [];
    await this.indexManager.save(merged);
  }

  private todayKeyStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  private resetTodayIfNeeded(): void {
    const k = this.todayKeyStr();
    if (k !== this.todayKey) {
      this.todayKey = k;
      this.todayCount = 0;
    }
  }

  /** 今日新增数量（状态栏/简报用） */
  getTodayDepositCount(): number {
    this.resetTodayIfNeeded();
    return this.todayCount;
  }

  /** 布局就绪后尝试生成今日地质简报（幂等）。受总开关与「每日简报」子开关双重控制。 */
  async tryGenerateBriefing(): Promise<boolean> {
    if (!this.isEnabledFn() || !this.isBriefingEnabledFn()) return false;
    return this.dailyBriefing.tryGenerate();
  }

  /** 实时读取总开关状态（供手动沉积等场景判断） */
  isEnabled(): boolean {
    return this.isEnabledFn();
  }

  /** 设置页总开关变化时调用：刷新状态栏可见性 */
  updateIndicatorVisibility(): void {
    this.indicator.setEnabled(this.isEnabledFn());
  }

  /** 命令：从磁盘重建索引并刷新状态栏 */
  async rebuildIndex(): Promise<void> {
    const entries = await this.indexManager.rebuildFromMarkdown();
    await this.indexManager.save(entries);
    this.resetTodayIfNeeded();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    this.todayCount = entries.filter(
      (e) => e.timestamp * 1000 >= todayStart.getTime()
    ).length;
    this.indicator.setTodayCount(this.todayCount);
  }

  /** 点击状态栏：打开今日简报，不存在则生成 */
  private async openBriefing(): Promise<void> {
    const dateStr = this.formatDate(new Date());
    const filePath = normalizePath(
      `${this.folderName}/briefings/沉积层日报-${this.deviceName}-${dateStr}.md`
    );
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      await this.dailyBriefing.tryGenerate();
      file = this.app.vault.getAbstractFileByPath(filePath);
    }
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    } else {
      new Notice("今日简报尚未生成");
    }
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}