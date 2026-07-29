// version-bump.mjs — Sedimind 自动版本号 + 迭代日志（CHANGELOG）工具
//
// 工作流：
//   agent 每次改代码时把改动累积进 CHANGELOG 的 `## [Unreleased]` 段；
//   发布时（--finalize，默认）把 [Unreleased] 折叠成具体版本号并改写版本文件。
//
// 参数：
//   （无参 / --finalize） 默认。读 [Unreleased] 段，按内容推断或显式注释定级别，折叠成版本号。
//   --major|--minor|--patch 显式指定级别（仍折叠 [Unreleased]）。
//   --sync              镜像 package.json 版本到 manifest.json + versions.json（供 npm version 用）。
//   --dry               仅计算并打印，不写任何文件。
//   --auto              已废弃，等价默认 finalize（兼容旧调用）。
//
// [Unreleased] 段约定：
//   ## [Unreleased]
//   <!-- release: minor -->   <- 可选，显式锁定级别；缺省时按段内条目推断
//   ### Added / Changed / Fixed ...
// 推断规则：含 BREAKING→major；有 Added/Changed→minor；有 Fixed→patch；空→报错（除非显式指定级别）。
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const MF = "manifest.json";
const PKG = "package.json";
const VF = "versions.json";
const CL = "CHANGELOG.md";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const sync = args.includes("--sync");
const autoDeprecated = args.includes("--auto");
const explicit = args.includes("--major")
  ? "major"
  : args.includes("--minor")
  ? "minor"
  : args.includes("--patch")
  ? "patch"
  : null;
const finalize = !sync && (args.length === 0 || args.includes("--finalize") || autoDeprecated);

function readJSON(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
function writeJSON(p, o) {
  writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
}

function parseVer(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v || "") || ["", 1, 1, 0];
  return [+m[1], +m[2], +m[3]];
}
function bump([a, b, c], t) {
  if (t === "major") return [a + 1, 0, 0];
  if (t === "minor") return [a, b + 1, 0];
  if (t === "patch") return [a, b, c + 1];
  return [a, b, c];
}
const fmt = ([a, b, c]) => `${a}.${b}.${c}`;

// 解析 CHANGELOG，定位 [Unreleased] 段
function parseChangelog() {
  if (!existsSync(CL)) return null;
  const content = readFileSync(CL, "utf8");
  const start = content.indexOf("## [Unreleased]");
  if (start < 0) return { content, body: null, before: content, after: "" };
  const afterHeader = content.indexOf("\n", start);
  const rest = content.slice(afterHeader + 1);
  const next = rest.search(/\n##\s*\[/);
  const end = next < 0 ? rest.length : next;
  const body = rest.slice(0, end);
  const before = content.slice(0, afterHeader + 1); // 含 "## [Unreleased]\n"
  const after = rest.slice(end);
  const m = /<!--\s*release:\s*(major|minor|patch)\s*-->/i.exec(body);
  const releaseNote = m ? m[1].toLowerCase() : null;
  return { content, body, before, after, releaseNote };
}

function inferLevel(body) {
  if (/BREAKING/i.test(body)) return "major";
  if (/###\s*Added/i.test(body) || /###\s*Changed/i.test(body)) return "minor";
  if (/###\s*Fixed/i.test(body)) return "patch";
  return "patch"; // 兜底
}

function finalizeChangelog(newVer, body, before, after) {
  const date = new Date().toISOString().slice(0, 10);
  const headNew = before.replace(/##\s*\[Unreleased\]/, `## [${newVer}] - ${date}`);
  const clean = body.replace(/<!--\s*release:\s*(major|minor|patch)\s*-->\s*\n?/i, "");
  return headNew + clean + after;
}

// README 版本徽章是写死静态文本（badge/version-X.Y.Z-blue），finalize 时一并替换，避免漏改。
const READMES = ["README.md", "README_zh.md"];
function updateReadmeBadges(newVer) {
  const re = /version-\d+\.\d+\.\d+-blue/g;
  const changed = [];
  for (const f of READMES) {
    if (!existsSync(f)) continue;
    const c = readFileSync(f, "utf8");
    const updated = c.replace(re, `version-${newVer}-blue`);
    if (updated !== c) {
      writeFileSync(f, updated);
      changed.push(f);
    }
  }
  return changed;
}

// ===== 主流程 =====
const manifest = readJSON(MF);
const pkg = existsSync(PKG) ? readJSON(PKG) : null;

if (sync) {
  if (!pkg) {
    console.error("[version-bump] package.json not found");
    process.exit(1);
  }
  manifest.version = pkg.version;
  writeJSON(MF, manifest);
  const versions = existsSync(VF) ? readJSON(VF) : {};
  versions[manifest.version] = manifest.minAppVersion || "1.5.0";
  writeJSON(VF, versions);
  console.log(manifest.version);
  process.exit(0);
}

if (autoDeprecated) {
  console.error("[version-bump] 警告: --auto 已废弃，现等价于默认 finalize（读 [Unreleased] 段）。");
}

// ---- finalize ----
const cl = parseChangelog();
const empty = !cl || !cl.body || !cl.body.trim();

if (empty && !explicit) {
  console.error(
    "[version-bump] 未找到 [Unreleased] 段或段为空。请先在 CHANGELOG.md 累积改动（Added/Changed/Fixed），或显式指定 --major/--minor/--patch。"
  );
  if (dry) console.log(fmt(parseVer(manifest.version)));
  process.exit(1);
}

const level = explicit || (cl && cl.releaseNote) || (cl && inferLevel(cl.body)) || "patch";
const cur = parseVer(manifest.version);
const next = bump(cur, level);
const newVer = fmt(next);

if (dry) {
  console.error(`[dry] current=${fmt(cur)} -> next=${newVer} (level=${level})`);
  console.error("[dry] 将把 [Unreleased] 折叠为: " + newVer);
  console.error("[dry] 将同步更新 README 版本徽章 -> " + newVer);
  console.log(newVer);
  process.exit(0);
}

// 写 CHANGELOG（折叠 [Unreleased] -> [X.Y.Z]）
if (cl) {
  const newContent = finalizeChangelog(newVer, cl.body || "", cl.before, cl.after);
  writeFileSync(CL, newContent);
}

// 写版本文件
manifest.version = newVer;
writeJSON(MF, manifest);
if (pkg) {
  pkg.version = newVer;
  writeJSON(PKG, pkg);
}
const versions = existsSync(VF) ? readJSON(VF) : {};
versions[newVer] = manifest.minAppVersion || "1.5.0";
writeJSON(VF, versions);

// 写 README 版本徽章（写死静态文本，需同步）
const badgeChanged = updateReadmeBadges(newVer);
if (badgeChanged.length) {
  console.error("[version-bump] 已更新版本徽章: " + badgeChanged.join(", "));
}

console.log(newVer);
