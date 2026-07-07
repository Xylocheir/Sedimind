import { App, Vault, TFile, normalizePath } from "obsidian";
import { LLMChatSettings } from "../settings";
import { ChatMessage } from "../llm/LLMProvider";

/** 近期对话记录 */
export interface RecentConversation {
  id: string;
  title: string;
  summary: string;
  timestamp: number;
}

/**
 * 记忆管理器 — 管理近期对话摘要 + 保存记忆
 * 参考 Copilot 的近期对话与保存记忆机制
 */
export class MemoryManager {
  private app: App;
  private settings: LLMChatSettings;

  constructor(app: App, settings: LLMChatSettings) {
    this.app = app;
    this.settings = settings;
  }

  // ====== 近期对话记忆 ======

  /** 保存对话摘要到近期记忆 */
  async saveRecentConversation(id: string, title: string, summary: string): Promise<void> {
    if (!this.settings.enableRecentConversations) return;

    const recent = this.loadRecentConversations();
    const existing = recent.findIndex((r) => r.id === id);

    const record: RecentConversation = {
      id,
      title,
      summary,
      timestamp: Date.now(),
    };

    if (existing >= 0) {
      recent[existing] = record;
    } else {
      recent.unshift(record);
    }

    // 只保留最近的 N 条
    const max = this.settings.maxRecentConversations || 5;
    const trimmed = recent.slice(0, max);

    this.saveRecentConversations(trimmed);
  }

  /** 获取近期对话摘要文本（用于注入 system prompt） */
  getRecentConversationsContext(): string {
    if (!this.settings.enableRecentConversations) return "";

    const recent = this.loadRecentConversations();
    if (recent.length === 0) return "";

    const lines = recent.map(
      (r) =>
        `- [${r.title}] ${r.summary} (${new Date(r.timestamp).toLocaleDateString()})`
    );

    return `\n\n近期对话历史摘要：\n${lines.join("\n")}`;
  }

  // ====== 保存记忆 ======

  /** 保存一条用户明确要求记住的信息 */
  async saveMemory(content: string): Promise<void> {
    if (!this.settings.enableSavedMemory) return;

    const folderPath = normalizePath(this.settings.memoryFolderName);
    const vault = this.app.vault;

    // 确保记忆文件夹存在
    const folder = vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await vault.createFolder(folderPath);
    }

    // 生成文件名：时间戳 + 简短摘要
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const shortContent = content.slice(0, 40).replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `${timestamp}_${shortContent}.md`;
    const filePath = normalizePath(`${folderPath}/${fileName}`);

    await vault.create(filePath, `---\ncreated: ${new Date().toISOString()}\ntype: memory\n---\n\n${content}\n`);
    console.log(`[MemoryManager] Saved memory: ${filePath}`);
  }

  /** 获取所有保存记忆的文本（用于注入 system prompt） */
  async getSavedMemoryContext(): Promise<string> {
    if (!this.settings.enableSavedMemory) return "";

    const folderPath = normalizePath(this.settings.memoryFolderName);
    const vault = this.app.vault;
    const folder = vault.getAbstractFileByPath(folderPath);

    if (!folder) return "";

    const files = vault.getMarkdownFiles().filter((f) => f.path.startsWith(folderPath));
    if (files.length === 0) return "";

    const memories: string[] = [];
    for (const file of files.slice(0, 20)) {
      // 最多读取 20 条记忆
      try {
        const content = await vault.read(file);
        memories.push(`- ${content.trim()}`);
      } catch {
        // skip unreadable
      }
    }

    if (memories.length === 0) return "";

    return `\n\n用户保存的记忆：\n${memories.join("\n")}`;
  }

  // ====== 对话总结 ======

  /** 根据对话历史生成摘要（简单的关键词提取法，也可由 LLM 生成） */
  generateSummary(messages: ChatMessage[]): string {
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length === 0) return "空对话";

    // 提取前 3 条用户消息作为摘要参考
    const topics = userMessages
      .slice(0, 3)
      .map((m) => m.content.slice(0, 50))
      .join("；");

    return topics;
  }

  // ====== 内部存储 ======

  private getMemoryDataPath(): string {
    return normalizePath(".obsidian/llm-chat/recent-conversations.json");
  }

  private loadRecentConversations(): RecentConversation[] {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.getMemoryDataPath());
      if (file instanceof TFile) {
        // Sync read in plugin context
        return [];
      }
      return [];
    } catch {
      return [];
    }
  }

  private async saveRecentConversations(conversations: RecentConversation[]): Promise<void> {
    try {
      const path = this.getMemoryDataPath();
      const folderPath = normalizePath(".obsidian/llm-chat");

      // Ensure folder exists
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }

      const content = JSON.stringify(conversations, null, 2);
      const existing = this.app.vault.getAbstractFileByPath(path);

      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, content);
      } else {
        await this.app.vault.create(path, content);
      }
    } catch (error) {
      console.error("[MemoryManager] Failed to save conversations:", error);
    }
  }
}
