import { App, normalizePath, TFile } from "obsidian";
import { L1Writer } from "../storage/l1-writer";
import { IndexManager } from "../storage/index-manager";
import { I18N } from "../SedimentManager";
import { BriefingConfig } from "../types";
import { readJson } from "../storage/derived-store";

export class DailyBriefing {
  private app: App;
  private l1Writer: L1Writer;
  private indexManager: IndexManager;
  private outputDir: string;
  private deviceName: string;
  private folderName: string;

  constructor(
    app: App,
    l1Writer: L1Writer,
    indexManager: IndexManager,
    config?: Partial<BriefingConfig>
  ) {
    this.app = app;
    this.l1Writer = l1Writer;
    this.indexManager = indexManager;
    this.outputDir = (config && config.outputDir) || ".sediment/briefings";
    this.deviceName = (config && config.deviceName) || "default";
    this.folderName = (config && config.folderName) || ".sediment";
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private startOfToday(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private async readSnippet(sourceFile: string): Promise<string | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(sourceFile);
      if (!(file instanceof TFile)) return null;
      const raw = await this.app.vault.adapter.read(sourceFile);
      // 跳过 frontmatter，取正文前 200 字符
      const body = raw.replace(/^---\s*\r?\n[\s\S]*?\r?\n---/, "").trim();
      const snippet = body.slice(0, 200).replace(/\s+/g, " ").trim();
      return snippet || null;
    } catch {
      return null;
    }
  }

  private async readDerived<T>(name: string): Promise<T | null> {
    const p = normalizePath(`${this.folderName}/derived/${name}.json`);
    try {
      if (!(await this.app.vault.adapter.exists(p))) return null;
      return JSON.parse(await this.app.vault.adapter.read(p)) as T;
    } catch {
      return null;
    }
  }

  /**
   * 尝试生成今日地质简报。已生成则返回 false。
   */
  async tryGenerate(): Promise<boolean> {
    const now = new Date();
    const dateStr = this.formatDate(now);
    const fileName = `沉积层日报-${this.deviceName}-${dateStr}.md`;
    const dir = normalizePath(this.outputDir);
    const filePath = normalizePath(`${dir}/${fileName}`);

    if (await this.app.vault.adapter.exists(filePath)) {
      return false; // 今日已生成
    }

    // 从磁盘重建索引以保证计数准确
    const entries = await this.indexManager.rebuildFromMarkdown();
    const todayStart = this.startOfToday();

    const todayCount = entries.filter(
      (e) => e.timestamp * 1000 >= todayStart
    ).length;
    const total = entries.length;

    // 随机回顾一条旧沉积（前 200 字符）
    let snippet = "> （暂无旧沉积可回顾）";
    const oldOnes = entries.filter((e) => e.timestamp * 1000 < todayStart);
    if (oldOnes.length > 0) {
      const pick = oldOnes[Math.floor(Math.random() * oldOnes.length)];
      const s = await this.readSnippet(pick.source_file);
      if (s) snippet = `> ${s}`;
    }

    // Phase 2 派生态章节（矿脉/断层）
    const veins = (await this.readDerived<{ label: string; confirmed: boolean }[]>("veins")) || [];
    const faults = (await this.readDerived<{ summary: string; status: string }[]>("faults")) || [];
    const openFaults = faults.filter((f) => f.status === "open");
    const unconfirmedVeins = veins.filter((v) => !v.confirmed);

    let phase2 = "";
    if (veins.length > 0 || faults.length > 0) {
      phase2 +=
        `\n## 💎 今日结晶（矿脉）\n` +
        (veins.length
          ? veins.map((v) => `- ${v.label}${v.confirmed ? "（已确认）" : "（待审阅）"}`).join("\n")
          : "（暂无）") +
        `\n\n## ⚡ 张力命题（断层）\n` +
        (openFaults.length ? openFaults.map((f) => `- ${f.summary}`).join("\n") : "（暂无冲突）") +
        `\n\n## 🧭 新近矿脉（待升权）\n` +
        (unconfirmedVeins.length ? unconfirmedVeins.map((v) => `- ${v.label}`).join("\n") : "（暂无）") +
        `\n`;
    }

    // Phase 3 主动进化章节（灵感杂交 / 压实 / 虫洞）
    const hybrids =
      (await this.readDerived<{ title: string; confirmed: boolean }[]>("hybrids")) || [];
    const unconfirmedHybrids = hybrids.filter((h) => !h.confirmed);
    const manifest =
      (await this.readDerived<{ lastCompact: number | null }>("compaction_manifest")) || {
        lastCompact: null,
      };
    let compactionSummary = "（暂无压实记录）";
    if (manifest.lastCompact) {
      const cd = new Date(manifest.lastCompact * 1000);
      const period = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
      const rec = await this.readDerived<{ summary: string }>(`compaction-${period}`);
      compactionSummary = rec && rec.summary ? rec.summary : "（本期无摘要）";
    }
    const wormholes =
      (await this.readDerived<{ relation: string; explanation: string }[]>("wormhole_hits")) || [];

    let phase3 = "";
    if (hybrids.length > 0 || manifest.lastCompact || wormholes.length > 0) {
      phase3 +=
        `\n## 💡 灵感杂交（认知杂交）\n` +
        (hybrids.length
          ? hybrids.map((h) => `- ${h.title}${h.confirmed ? "（已升权）" : "（待审阅）"}`).join("\n")
          : "（暂无）") +
        `\n\n## 🪨 周期性压实\n` +
        `${compactionSummary}\n` +
        (unconfirmedHybrids.length
          ? `\n待升权灵感：${unconfirmedHybrids.map((h) => h.title).join("、")}`
          : "") +
        `\n\n## 🪱 虫洞对照\n` +
        (wormholes.length
          ? wormholes.map((w) => `- [${w.relation}] ${w.explanation}`).join("\n")
          : "（暂无）") +
        `\n`;
    }

    const body =
      `---\n` +
      `type: sediment-briefing\n` +
      `date: ${dateStr}\n` +
      `device: ${this.deviceName}\n` +
      `---\n\n` +
      `# ${I18N.briefingTitle(dateStr)}\n\n` +
      `## 今日概况\n` +
      `- 今日新增沉积物：**${todayCount}** 条\n` +
      `- 沉积层总条目：**${total}** 条\n\n` +
      `## 📜 随机回顾\n` +
      `${snippet}\n\n` +
      phase2 +
      phase3 +
      `---\n` +
      `*由沉积层引擎自动生成*\n`;

    try {
      if (!(await this.app.vault.adapter.exists(dir))) {
        await this.app.vault.createFolder(dir);
      }
      await this.app.vault.adapter.write(filePath, body);
      return true;
    } catch (e) {
      console.error("[DailyBriefing] generate failed:", e);
      return false;
    }
  }
}
