import { App, Modal } from "obsidian";
import type { SedimentManager } from "../SedimentManager";
import type { WormholeRelation } from "../types";

const REL_LABEL: Record<WormholeRelation, string> = {
  contradiction: "矛盾",
  resonance: "呼应",
  evolution: "演化",
};

/** 查看实时虫洞对照记录 */
export class WormholeHitsModal extends Modal {
  constructor(app: App, private sediment: SedimentManager) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "🪱 虫洞：记忆对照" });
    const hits = await this.sediment.loadWormholeHits();
    if (!hits.length) {
      contentEl.createEl("p", {
        text: "暂无虫洞对照记录。开启「实时虫洞」后编辑笔记会自动产生对照。",
      });
      return;
    }
    for (const h of hits) {
      const box = contentEl.createDiv("wormhole-hit");
      box.createEl("div", {
        text: `【${REL_LABEL[h.relation] || h.relation}】${h.explanation}`,
        cls: "wormhole-rel",
      });
      box.createEl("div", { text: `笔记：${h.note_excerpt}`, cls: "wormhole-excerpt" });
      box.createEl("div", {
        text: `沉积层：${h.sediment_excerpt}`,
        cls: "wormhole-excerpt",
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
