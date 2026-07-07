import { App, Modal, Setting, Notice } from "obsidian";
import { SedimentManager } from "../sediment/SedimentManager";

export class ManualSedimentModal extends Modal {
  private sedimentManager: SedimentManager | null;
  private contentInput: HTMLTextAreaElement | null = null;
  private topicInput: HTMLTextAreaElement | null = null;

  constructor(app: App, sedimentManager: SedimentManager | null) {
    super(app);
    this.sedimentManager = sedimentManager;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "手动沉积" });
    contentEl.createEl("p", {
      text:
        "将任意内容（如外部 AI 的回复、你的想法）沉积到本地沉积层。" +
        "系统会按重力筛选规则自动判断是否保留。",
    });

    new Setting(contentEl)
      .setName("内容")
      .setDesc("要沉积的文本内容")
      .addTextArea((text) => {
        text.setPlaceholder("输入要沉积的内容...");
        text.inputEl.rows = 6;
        text.inputEl.style.width = "100%";
        this.contentInput = text.inputEl;
      });

    new Setting(contentEl)
      .setName("话题标签（可选）")
      .setDesc("用于文件名与索引，留空则自动取内容前 20 字")
      .addTextArea((text) => {
        text.setPlaceholder("可选话题");
        text.inputEl.rows = 1;
        text.inputEl.style.width = "100%";
        this.topicInput = text.inputEl;
      });

    const btnRow = contentEl.createDiv();
    btnRow.addClass("modal-button-container");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "8px";

    btnRow.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());

    const submitBtn = btnRow.createEl("button", { text: "沉积" });
    submitBtn.addClass("mod-primary");
    submitBtn.addEventListener("click", () => {
      this.handleSubmit();
    });
  }

  private async handleSubmit(): Promise<void> {
    const content = this.contentInput?.value.trim() || "";
    if (!content) {
      new Notice("请输入要沉积的内容");
      return;
    }
    if (!this.sedimentManager) {
      new Notice("沉积层未初始化");
      return;
    }
    if (!this.sedimentManager.isEnabled()) {
      new Notice("沉积层已关闭，请在设置中开启");
      return;
    }
    const topic = this.topicInput?.value.trim() || undefined;
    const ok = await this.sedimentManager.processContent(content, topic);
    if (ok) {
      new Notice("沉积成功");
      this.close();
    } else {
      new Notice("内容被重力筛选蒸发，未沉积");
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}