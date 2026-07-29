import { App, normalizePath, TFile } from "obsidian";
import { SedimentIndexEntry, SedimentLayer, SedimentStatus } from "../types";

export interface IndexManagerConfig {
  folderName?: string; // 默认 ".sediment"
}

export class IndexManager {
  private app: App;
  private folderName: string;
  private indexPath: string;
  private cache: SedimentIndexEntry[] = [];

  constructor(app: App, config?: IndexManagerConfig) {
    this.app = app;
    this.folderName = (config && config.folderName) || ".sediment";
    this.indexPath = normalizePath(`${this.folderName}/sediment_index.json`);
  }

  /** 读取整张索引（JSON 缓存） */
  async load(): Promise<SedimentIndexEntry[]> {
    try {
      if (!(await this.app.vault.adapter.exists(this.indexPath))) {
        this.cache = [];
        return this.cache;
      }
      const raw = await this.app.vault.adapter.read(this.indexPath);
      const parsed = JSON.parse(raw);
      this.cache = Array.isArray(parsed) ? (parsed as SedimentIndexEntry[]) : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  /** 写入整张索引 */
  async save(entries: SedimentIndexEntry[]): Promise<void> {
    this.cache = entries;
    try {
      const raw = JSON.stringify(entries, null, 2);
      await this.app.vault.adapter.write(this.indexPath, raw);
    } catch (e) {
      console.error("[IndexManager] save failed:", e);
    }
  }

  /** 新增一条索引条目（按 id 去重） */
  async addEntry(entry: SedimentIndexEntry): Promise<void> {
    const entries = await this.load();
    if (entries.some((e) => e.id === entry.id)) {
      await this.save(entries);
      return;
    }
    entries.push(entry);
    await this.save(entries);
  }

  /** 更新一条索引条目 */
  async updateEntry(
    id: string,
    updates: Partial<SedimentIndexEntry>
  ): Promise<void> {
    const entries = await this.load();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], ...updates };
      await this.save(entries);
    }
  }

  /** 返回内存缓存的全部条目（供投影/排序/注入使用） */
  getAll(): SedimentIndexEntry[] {
    return this.cache;
  }

  /** 极简 YAML 解析：仅处理 `key: value`（值可为数字或字符串） */
  private parseFrontmatter(raw: string): Record<string, unknown> {
    const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const body = m[1];
    const out: Record<string, unknown> = {};
    for (const line of body.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (val === "") {
        out[key] = "";
        continue;
      }
      if (/^-?\d+(\.\d+)?$/.test(val)) {
        out[key] = Number(val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  /**
   * 从磁盘 Markdown 重建整张索引（rebuildFromMarkdown）。
   * 扫描 `.sediment/` 下所有 .md（排除 briefings/ 与索引文件本身），
   * 读取 frontmatter 重建条目。citation/retrieval 运行态字段默认 0。
   */
  async rebuildFromMarkdown(): Promise<SedimentIndexEntry[]> {
    const root = normalizePath(this.folderName);
    let files: string[] = [];
    try {
      const listing = await this.app.vault.adapter.list(root);
      files = listing.files.filter(
        (f) =>
          f.endsWith(".md") &&
          !f.includes("/briefings/") &&
          normalizePath(f) !== this.indexPath
      );
    } catch {
      return [];
    }

    const entries: SedimentIndexEntry[] = [];
    for (const f of files) {
      try {
        const raw = await this.app.vault.adapter.read(f);
        const fm = this.parseFrontmatter(raw);
        if (typeof fm.type === "string" && fm.type !== "sediment") continue;
        const id = f.split("/").pop()!.replace(/\.md$/, "");
        const tsRaw =
          typeof fm.created === "string"
            ? Date.parse(fm.created)
            : typeof fm.created === "number"
            ? fm.created
            : Date.now();
        const timestamp = Math.floor((isNaN(tsRaw) ? Date.now() : tsRaw) / 1000);
        const layer: SedimentLayer =
          fm.layer === "L2" || fm.layer === "L3" ? fm.layer : "L1";
        const status: SedimentStatus =
          fm.status === "superseded" || fm.status === "conflicted"
            ? (fm.status as SedimentStatus)
            : "active";
        entries.push({
          id,
          layer,
          timestamp,
          survival_score:
            typeof fm.survival_score === "number" ? fm.survival_score : 0.5,
          novelty_score:
            typeof fm.novelty_score === "number" ? fm.novelty_score : 1.0,
          explore_boost:
            typeof fm.explore_boost === "number" ? fm.explore_boost : 0.0,
          status,
          topic: typeof fm.topic === "string" ? fm.topic : id,
          source_file: f,
          citation_count: 0,
          retrieval_count: 0,
          facies: (fm.facies as SedimentIndexEntry["facies"]) || undefined,
          stance: (fm.stance as SedimentIndexEntry["stance"]) || undefined,
          cross_cutting: Array.isArray(fm.cross_cutting) ? (fm.cross_cutting as string[]) : [],
        });
      } catch {
        // 跳过解析失败的文件
      }
    }
    return entries;
  }
}
