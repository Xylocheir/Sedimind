// 变质引擎：按 topic 聚类，超阈值则调用 LLM 提炼"张力命题"（L3，活的、可修订）
import { App, normalizePath, TFile } from "obsidian";
import { SedimentIndexEntry, BedrockTenet } from "./types";
import { LLMChatSettings } from "../settings";
import { LLMProvider } from "../llm/index";
import { callJSON } from "./core/llm-json";
import { BEDROCK_DIR, BEDROCK_LOW_WEIGHT } from "./constants";
import { readJson, writeJson } from "./storage/derived-store";

export class MetamorphEngine {
  constructor(private app: App, private folderName: string) {}

  private genId(): string {
    return `tenet_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  private async existingTenets(): Promise<BedrockTenet[]> {
    const cached = await readJson<BedrockTenet[]>(this.app, this.folderName, "bedrock_index");
    if (cached) return cached;
    // 回退：扫描 bedrock 目录
    const dir = normalizePath(`${this.folderName}/${BEDROCK_DIR}`);
    const out: BedrockTenet[] = [];
    try {
      const listing = await this.app.vault.adapter.list(dir);
      for (const f of listing.files) {
        try {
          const raw = await this.app.vault.adapter.read(f);
          const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
          if (!m) continue;
          const fm: Record<string, unknown> = {};
          for (const line of m[1].split("\n")) {
            const i = line.indexOf(":");
            if (i < 0) continue;
            fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
          }
          out.push({
            id: (fm.id as string) || f.split("/").pop()!.replace(/\.md$/, ""),
            path: f,
            tension: (fm.tension as string) || "",
            assertion: (fm.assertion as string) || "",
            source_ids: [],
            status: (fm.status as BedrockTenet["status"]) || "open",
            created: typeof fm.created === "number" ? fm.created : Date.now(),
            updated: typeof fm.updated === "number" ? fm.updated : Date.now(),
            weight: typeof fm.weight === "number" ? fm.weight : BEDROCK_LOW_WEIGHT,
          });
        } catch {
          /* skip */
        }
      }
    } catch {
      /* no dir */
    }
    return out;
  }

  /** 执行变质：返回本次新生成的张力命题 */
  async metamorph(
    entries: SedimentIndexEntry[],
    s: LLMChatSettings,
    provider: LLMProvider | null
  ): Promise<BedrockTenet[]> {
    const existing = await this.existingTenets();
    const existingTopics = new Set(existing.map((t) => t.tension || t.assertion));
    // 按 topic 聚类
    const clusters = new Map<string, SedimentIndexEntry[]>();
    for (const e of entries) {
      const key = (e.topic || "").trim().toLowerCase();
      if (!key) continue;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(e);
    }

    const newTenets: BedrockTenet[] = [];
    let dailyCount = 0;
    const cap = s.sedimentCaps.metamorphPerDay;

    for (const [key, members] of clusters) {
      if (dailyCount >= cap) break;
      if (members.length < s.sedimentMetamorph.n) continue;
      // 避免重复：同类 topic 已有张力命题则跳过
      if (existingTopics.has(members[0].topic)) continue;

      let tension = "";
      let assertion = "";
      if (provider) {
        const prompt =
          `基于这些认知节点，提炼一个"张力命题"：\n` +
          `- tension：两股力量为何紧张（核心，不要给结论）\n` +
          `- assertion：当前倾向性表述（可被推翻）\n` +
          `只输出 JSON {tension, assertion}。\n节点：\n` +
          members.map((m) => `- ${m.topic}: ${m.facies || ""} ${m.stance || ""}`).join("\n");
        const r = await callJSON(provider, prompt);
        tension = r && typeof r.tension === "string" ? r.tension : "";
        assertion = r && typeof r.assertion === "string" ? r.assertion : members[0].topic;
      } else {
        assertion = members[0].topic;
        tension = `关于「${members[0].topic}」存在多种取向`;
      }
      if (!tension) continue;

      const id = this.genId();
      const now = Date.now();
      const path = normalizePath(`${this.folderName}/${BEDROCK_DIR}/${id}.md`);
      const weight = s.sedimentWeight.survival * BEDROCK_LOW_WEIGHT;
      const fm =
        `---\n` +
        `id: ${id}\n` +
        `type: bedrock\n` +
        `tension: ${tension.replace(/\n/g, " ")}\n` +
        `assertion: ${assertion.replace(/\n/g, " ")}\n` +
        `source_ids: [${members.map((m) => m.id).join(", ")}]\n` +
        `status: open\n` +
        `created: ${now}\n` +
        `updated: ${now}\n` +
        `weight: ${weight}\n` +
        `---\n`;
      try {
        const dir = normalizePath(`${this.folderName}/${BEDROCK_DIR}`);
        if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.createFolder(dir);
        await this.app.vault.adapter.write(path, fm);
      } catch (e) {
        console.error("[MetamorphEngine] write failed:", e);
        continue;
      }
      newTenets.push({
        id, path, tension, assertion,
        source_ids: members.map((m) => m.id),
        status: "open", created: now, updated: now, weight,
      });
      dailyCount++;
    }

    if (newTenets.length > 0) {
      await writeJson(this.app, this.folderName, "bedrock_index", [...existing, ...newTenets]);
    }
    return newTenets;
  }
}
