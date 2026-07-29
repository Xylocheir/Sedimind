// 标记洞见/升权弹窗：列出未确认矿脉，确认后升权
import { App, Modal, Setting } from "obsidian";
import { SedimentManager } from "../SedimentManager";

export class MarkInsightfulModal extends Modal {
  constructor(app: App, private sediment: SedimentManager) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "标记洞见 / 升权矿脉" });
    const veins = await this.sediment.getUnconfirmedVeins();
    if (veins.length === 0) {
      contentEl.createEl("p", { text: "当前没有待升权的矿脉。" });
      return;
    }
    for (const v of veins) {
      new Setting(contentEl)
        .setName(v.label)
        .addButton((btn) =>
          btn
            .setButtonText("确认升权")
            .setCta()
            .onClick(async () => {
              await this.sediment.confirmVein(v.id);
              this.onOpen();
            })
        );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
