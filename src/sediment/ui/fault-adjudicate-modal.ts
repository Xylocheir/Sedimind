// 断层裁决弹窗：列出 open 断层，可采纳为张力命题或忽略
import { App, Modal, Setting } from "obsidian";
import { SedimentManager } from "../SedimentManager";
import { FaultRecord } from "../types";

export class FaultAdjudicateModal extends Modal {
  constructor(app: App, private sediment: SedimentManager) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "裁决断层（张力命题）" });
    const faults = await this.sediment.getOpenFaults();
    if (faults.length === 0) {
      contentEl.createEl("p", { text: "当前没有待观察的断层。" });
      return;
    }
    for (const f of faults) {
      this.renderFault(contentEl, f);
    }
  }

  private renderFault(container: HTMLElement, f: FaultRecord): void {
    new Setting(container)
      .setName(f.summary)
      .setDesc(`类型：${f.kind}`)
      .addButton((btn) =>
        btn
          .setButtonText("采纳为张力命题")
          .setCta()
          .onClick(async () => {
            await this.sediment.adjudicateFault(
              f.id,
              `关于「${f.summary}」存在两种取向的张力`,
              f.summary
            );
            this.onOpen();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("忽略").onClick(async () => {
          await this.sediment.dismissFault(f.id);
          this.onOpen();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
