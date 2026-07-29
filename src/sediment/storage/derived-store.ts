// 派生态 JSON 读写（metamorph/fault/vein 的衍生结果，独立目录，不回写化石）
import { App, normalizePath } from "obsidian";

export async function readJson<T>(app: App, folderName: string, name: string): Promise<T | null> {
  const p = normalizePath(`${folderName}/derived/${name}.json`);
  try {
    if (!(await app.vault.adapter.exists(p))) return null;
    const raw = await app.vault.adapter.read(p);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(
  app: App,
  folderName: string,
  name: string,
  data: unknown
): Promise<void> {
  const dir = normalizePath(`${folderName}/derived`);
  const p = normalizePath(`${dir}/${name}.json`);
  try {
    if (!(await app.vault.adapter.exists(dir))) await app.vault.createFolder(dir);
    await app.vault.adapter.write(p, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[derived-store] write failed:", e);
  }
}
