import { App, normalizePath, TFile } from "obsidian";
import { FilterResult } from "../types";

export interface L1WriterConfig {
  folderName: string; // 默认 ".sediment"
}

export const DEFAULT_L1_CONFIG: L1WriterConfig = { folderName: ".sediment" };

/** 文件名/话题标签非法字符过滤 */
function sanitize(s: string): string {
  return s.replace(/[\\/:?"<>|]/g, "");
}

export class L1Writer {
  private app: App;
  private folderName: string;

  constructor(app: App, config: L1WriterConfig = DEFAULT_L1_CONFIG) {
    this.app = app;
    this.folderName = config.folderName || ".sediment";
  }

  /** `.sediment` 根目录 */
  private baseFolder(): string {
    return normalizePath(this.folderName);
  }

  /** `.sediment/L1/年月` 目录 */
  private l1Folder(): string {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    return normalizePath(`${this.baseFolder()}/L1/${ym}`);
  }

  /** 依据筛选动作推导初始评分 */
  private scoresFor(action: FilterResult["action"]): {
    survival: number;
    novelty: number;
    explore: number;
  } {
    if (action === "mark_high") {
      return { survival: 0.8, novelty: 1.0, explore: 0.0 };
    }
    // record（evaporate 不会进入写入流程）
    return { survival: 0.5, novelty: 1.0, explore: 0.0 };
  }

  /**
   * 写入一条 L1 沉积物。
   * @returns 相对 vault 的文件路径；被蒸发或写入失败返回 null
   */
  async deposit(
    content: string,
    topic?: string,
    metadata?: Record<string, unknown>
  ): Promise<string | null> {
    const trimmed = content.trim();
    if (!trimmed) return null;

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const label = sanitize(
      (topic && topic.trim() ? topic.trim() : trimmed.slice(0, 20))
    ).slice(0, 20).trim();
    const fileName = `${ts}-${label}.md`;
    const filePath = normalizePath(`${this.l1Folder()}/${fileName}`);

    const action: FilterResult["action"] =
      metadata && typeof metadata.filter_result === "string"
        ? (metadata.filter_result as FilterResult["action"])
        : "record";
    const scores = this.scoresFor(action);

    const front =
      `---\n` +
      `created: ${now.toISOString()}\n` +
      `type: sediment\n` +
      `layer: L1\n` +
      `topic: ${label}\n` +
      `filter_result: ${action}\n` +
      `survival_score: ${scores.survival}\n` +
      `novelty_score: ${scores.novelty}\n` +
      `explore_boost: ${scores.explore}\n` +
      `---\n\n` +
      `${trimmed}\n`;

    try {
      const l1 = this.l1Folder();
      if (!(await this.app.vault.adapter.exists(l1))) {
        await this.app.vault.createFolder(l1);
      }
      await this.app.vault.adapter.write(filePath, front);
      return filePath;
    } catch (e) {
      console.error("[L1Writer] deposit failed:", e);
      return null;
    }
  }

  /** 返回全部 L1 文件（TFile 列表） */
  async listDeposits(): Promise<TFile[]> {
    const l1 = this.l1Folder();
    try {
      if (!(await this.app.vault.adapter.exists(l1))) return [];
      return this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(l1 + "/"));
    } catch {
      return [];
    }
  }
}
