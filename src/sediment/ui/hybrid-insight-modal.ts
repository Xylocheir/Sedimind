import { App, Modal, Setting, Notice } from "obsidian";
import type { SedimentManager } from "../SedimentManager";

/** 确认认知杂交灵感升权（标「有启发」） */
export class HybridInsightModal extends Modal {
  constructor(app: App, private sediment: SedimentManager) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "💡 认知杂交：确认灵感升权" });
    const list = await this.sediment.getUnconfirmedHybrids();
    if (!list.length) {
      contentEl.createEl("p", {
        text: "当前没有待确认的灵感杂交。可用命令「强制灵感关联」生成。",
      });
      return;
    }
    for (const it of list) {
      const box = contentEl.createDiv("hybrid-item");
      box.createEl("div", { text: it.title, cls: "hybrid-title" });
      box.createEl("div", { text: it.synthesis, cls: "hybrid-synthesis" });
      new Setting(box)
        .setName("标「有启发」升权")
        .addButton((btn) =>
          btn.setButtonText("确认升权").setCta().onClick(async () => {
            await this.sediment.confirmHybrid(it.id);
            new Notice("灵感已升权");
            await this.onOpen();
          })
        );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
