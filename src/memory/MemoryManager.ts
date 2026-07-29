import { App, TFile, normalizePath } from "obsidian";
import { LLMChatSettings } from "../settings";

/**
 * 记忆管理器（意识层）— 参考 agent working-memory 机制实现
 *
 * 双层结构，全部落在 vault 内（便于未来与 OpenHuman 等外部记忆 hub 共享同一文件夹）：
 *  - journal/YYYY-MM-DD.md : 每日追加式日志（episodic，由自动蒸馏 fire-and-forget 写入）
 *  - profile/              : 长期稳定事实（陈述性记忆，由显式 save_memory 或升格写入）
 *
 * 与沉积层（潜意识）严格分开：本模块只存"成品"记忆，不存 AI 思考副产物。
 */
export class MemoryManager {
  private app: App;
  private settings: LLMChatSettings;

  constructor(app: App, settings: LLMChatSettings) {
    this.app = app;
    this.settings = settings;
  }

  // ====== 路径 ======

  private root(): string {
    return normalizePath(this.settings.memoryFolderName || "llm-chat/memory");
  }
  private journalFolder(): string {
    return normalizePath(`${this.root()}/journal`);
  }
  private profileFolder(): string {
    return normalizePath(`${this.root()}/profile`);
  }

  // ====== 加载（注入 system prompt） ======

  /** 读取全部记忆上下文，拼为 system prompt 片段 */
  async getMemoryContext(): Promise<string> {
    if (!this.settings.enableMemory) return "";

    const parts: string[] = [];

    const profile = await this.loadProfile();
    if (profile) {
      parts.push(`用户长期记忆（你是谁 / 稳定事实）：\n${profile}`);
    }

    const journal = await this.loadRecentJournal(this.settings.memoryJournalDays || 7);
    if (journal) {
      parts.push(`近期日记（按天记录的重要信息，越新越相关）：\n${journal}`);
    }

    if (!parts.length) return "";

    // 记忆召回协议（借 MemPalace recall-protocol）：回答前强制先参考用户记忆
    const prefix = this.settings.forceMemoryRecall
      ? "\n\n【记忆召回协议】回答前必须先参考上方用户长期记忆与近期日记，禁止凭空杜撰用户的身份、偏好与历史情况。"
      : "";
    return `${prefix}\n\n${parts.join("\n\n")}`;
  }

  private async loadProfile(): Promise<string> {
    const vault = this.app.vault;
    try {
      const profileFolder = this.profileFolder();
      const journalFolder = this.journalFolder();
      const rootFolder = this.root();

      const files = vault.getMarkdownFiles().filter((f) => {
        // 新结构：profile/ 下的文件
        if (f.path.startsWith(profileFolder + "/")) return true;
        // 兼容旧结构：记忆根目录下、非 journal/ 非 profile/ 的 type:memory 文件
        if (
          f.path.startsWith(rootFolder + "/") &&
          !f.path.startsWith(profileFolder + "/") &&
          !f.path.startsWith(journalFolder + "/")
        ) {
          return true;
        }
        return false;
      });

      if (files.length === 0) return "";

      const entries: string[] = [];
      for (const file of files.slice(0, 50)) {
        try {
          const content = await vault.read(file);
          // 画像失效窗口（借 MemPalace 时序 invalidate）：过期/超龄画像不注入上下文
          const fm = this.parseFrontmatter(content);
          if (this.isProfileExpired(fm)) continue;
          const body = this.stripFrontmatter(content).trim();
          if (body) entries.push(`- ${body}`);
        } catch {
          // skip unreadable
        }
      }
      return entries.join("\n");
    } catch {
      return "";
    }
  }

  /** 判断一条画像 frontmatter 是否已失效（命中后不再注入上下文，但磁盘保留） */
  private isProfileExpired(fm: Record<string, string>): boolean {
    if (fm["expired"] === "true" || fm["expired"] === true) return true;
    if (fm["active_until"]) {
      const au = Date.parse(fm["active_until"]);
      if (!isNaN(au) && au < Date.now()) return true;
    }
    const maxAge = this.settings.memoryProfileMaxAgeDays;
    if (maxAge > 0 && fm["updated"]) {
      const up = Date.parse(fm["updated"]);
      if (!isNaN(up) && Date.now() - up > maxAge * 86400000) return true;
    }
    return false;
  }

  /** 将当前文件标记为已失效（手动作废画像记忆：不再注入上下文，但磁盘保留） */
  async markExpired(filePath: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return false;
    try {
      const content = await this.app.vault.read(file);
      const fm = this.parseFrontmatter(content);
      fm["expired"] = "true";
      fm["active_until"] = "2000-01-01";
      const body = this.stripFrontmatter(content);
      await this.app.vault.modify(file, this.serializeFrontmatter(fm) + body);
      return true;
    } catch {
      return false;
    }
  }

  private async loadRecentJournal(days: number): Promise<string> {
    const vault = this.app.vault;
    try {
      const folder = this.journalFolder();
      const files = vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + "/"));
      if (files.length === 0) return "";

      const today = new Date();
      const wanted = new Set<string>();
      for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        wanted.add(this.dateStr(d));
      }

      const entries: string[] = [];
      for (const file of files) {
        const name = file.basename; // YYYY-MM-DD
        if (wanted.has(name)) {
          try {
            const content = await vault.read(file);
            entries.push(`【${name}】\n${content.trim()}`);
          } catch {
            // skip
          }
        }
      }
      entries.reverse(); // 按日期升序（旧→新）
      return entries.join("\n\n");
    } catch {
      return "";
    }
  }

  // ====== 写入：显式存档（save_memory 工具） ======

  /** 显式保存一条记忆（用户/AI 调用 save_memory 时） */
  async saveMemory(content: string): Promise<void> {
    if (!this.settings.enableMemory) return;
    const body = content.trim();
    if (!body) return;

    const vault = this.app.vault;
    const folderPath = this.profileFolder();
    await this.ensureFolder(folderPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = body.slice(0, 30).replace(/[\\/:*?"<>|#\n\r]/g, "_");
    const fileName = `${timestamp}_${slug}.md`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    const frontmatter = [
      "---",
      "type: memory",
      `created: ${new Date().toISOString()}`,
      "source: explicit",
      `updated: ${new Date().toISOString()}`,
      "---",
      "",
      body,
      "",
    ].join("\n");

    await vault.create(filePath, frontmatter);
    console.log(`[MemoryManager] Saved explicit memory: ${filePath}`);
  }

  // ====== 写入：自动蒸馏（后台 fire-and-forget） ======

  /** 把一轮对话抽取出的事实追加到当日日志 */
  async appendJournalEntry(facts: string[]): Promise<void> {
    if (!this.settings.enableMemory) return;
    if (!facts || facts.length === 0) return;

    const vault = this.app.vault;
    const folderPath = this.journalFolder();
    await this.ensureFolder(folderPath);

    const date = this.dateStr(new Date());
    const filePath = normalizePath(`${folderPath}/${date}.md`);
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

    const block = `\n## ${time}\n` + facts.map((f) => `- ${f}`).join("\n") + "\n";

    const existing = vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await vault.append(existing, block);
    } else {
      const header = `# 记忆日志 ${date}\n`;
      await vault.create(filePath, header + block);
    }
  }

  // ====== 工具 ======

  private stripFrontmatter(content: string): string {
    const m = content.match(/^---\n[\s\S]*?\n---\n?/);
    return m ? content.slice(m[0].length) : content;
  }

  /** 解析 YAML frontmatter 顶层 key: value（仅本模块需要的简单结构） */
  private parseFrontmatter(content: string): Record<string, string> {
    const fm: Record<string, string> = {};
    const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) return fm;
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) fm[key] = val;
    }
    return fm;
  }

  /** 重建 frontmatter 区块（保持简单 key: value 结构，无引号包裹） */
  private serializeFrontmatter(fm: Record<string, string>): string {
    const lines = ["---"];
    for (const k of Object.keys(fm)) {
      lines.push(`${k}: ${fm[k]}`);
    }
    lines.push("---", "");
    return lines.join("\n");
  }

  private dateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const vault = this.app.vault;
    const parts = folderPath.split("/").filter((p) => p.length > 0);
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      if (!vault.getAbstractFileByPath(cur)) {
        await vault.createFolder(cur);
      }
    }
  }
}
