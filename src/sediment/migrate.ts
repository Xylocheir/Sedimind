// 数据迁移：从 v1 兼容到 Phase 2（闭环 C2/C5，绝不破坏既有数据）
import { App, normalizePath } from "obsidian";
import { LLMChatSettings } from "../settings";
import { BEDROCK_LOW_WEIGHT } from "./constants";

/**
 * 在 onload 中 loadSettings 之后调用。
 * 当前仅修复旧 L3 bedrock 文件缺 tension 字段的情况，并兜底 weight。
 */
export function migrateFromV1(app: App, _settings: LLMChatSettings): void {
  try {
    const dir = normalizePath(".sediment/bedrock");
    void (async () => {
      try {
        const listing = await app.vault.adapter.list(dir);
        for (const f of listing.files) {
          try {
            const raw = await app.vault.adapter.read(f);
            const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
            if (!m) continue;
            const lines = m[1].split("\n");
            const hasTension = lines.some((l) => l.trimStart().startsWith("tension:"));
            const hasWeight = lines.some((l) => l.trimStart().startsWith("weight:"));
            const hasStatus = lines.some((l) => l.trimStart().startsWith("status:"));
            if (hasTension && hasWeight && hasStatus) continue;
            const assertionLine = lines.find((l) => l.trimStart().startsWith("assertion:"));
            const assertion = assertionLine ? assertionLine.split(":").slice(1).join(":").trim() : "";
            const patch: string[] = [];
            if (!hasTension) patch.push(`tension: ${assertion || "（未知张力）"}`);
            if (!hasStatus) patch.push(`status: open`);
            if (!hasWeight) patch.push(`weight: ${BEDROCK_LOW_WEIGHT}`);
            if (patch.length === 0) continue;
            const newFm = `---\n${lines.join("\n")}\n${patch.join("\n")}\n---\n`;
            const body = raw.slice(m[0].length);
            await app.vault.adapter.write(f, newFm + body);
          } catch {
            /* skip 单文件 */
          }
        }
      } catch {
        /* 无 bedrock 目录，跳过 */
      }
    })();
  } catch (e) {
    console.warn("[sediment] migrateFromV1 skipped:", e);
  }
}
