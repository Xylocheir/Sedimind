import { App, normalizePath, TFile } from "obsidian";
import { L1Writer } from "../storage/l1-writer";
import { IndexManager } from "../storage/index-manager";
import { I18N } from "../SedimentManager";
import { BriefingConfig } from "../types";

export class DailyBriefing {
  private app: App;
  private l1Writer: L1Writer;
  private indexManager: IndexManager;
  private outputDir: string;
  private deviceName: string;

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
