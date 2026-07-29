/**
 * 矛盾预筛（借 MemPalace 硬事实校验 + 零 LLM 理念）
 *
 * 与 LLM 断层检测互补：用确定性启发式先打掉"低级硬矛盾"
 * （数字/年份/年龄不一致、时间反转），把真正需要地质学家裁决的
 * 认知张力留给 LLM 与用户。全程不调用 LLM，零 API 成本。
 */

export type TokenKind = "year" | "age" | "number";

export interface NumericToken {
  raw: string;
  value: number;
  kind: TokenKind;
}

/** 从文本抽取确定性的数值型线索：年份、年龄、较长数字串 */
export function extractNumericTokens(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];
  const seen = new Set<string>();

  // 年份（19xx / 20xx）
  for (const m of text.matchAll(/\b(19\d{2}|20\d{2})\b/g)) {
    const v = Number(m[1]);
    const key = `year:${v}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push({ raw: m[1], value: v, kind: "year" });
    }
  }

  // 年龄（\d{1,3}岁 / 岁数）
  for (const m of text.matchAll(/(\d{1,3})\s*岁/g)) {
    const v = Number(m[1]);
    if (v > 0 && v < 150) {
      const key = `age:${v}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({ raw: m[1] + "岁", value: v, kind: "age" });
      }
    }
  }

  // 较长数字串（金额、时长、数量等，至少 3 位，排除已被年份命中的 4 位段）
  for (const m of text.matchAll(/\b(\d{3,})\b/g)) {
    // 跳过纯年份（已在上面单独记录，避免重复）
    if (/^(19\d{2}|20\d{2})$/.test(m[1])) continue;
    const v = Number(m[1]);
    const key = `number:${v}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push({ raw: m[1], value: v, kind: "number" });
    }
  }

  return tokens;
}

/** 同类 token 中数值不同即视为冲突，返回人类可读矛盾描述 */
export function conflictingTokens(a: NumericToken[], b: NumericToken[]): string[] {
  const conflicts: string[] = [];
  const seen = new Set<string>();
  const aByKind: Record<TokenKind, Map<number, NumericToken>> = {
    year: new Map(),
    age: new Map(),
    number: new Map(),
  };
  const bByKind: Record<TokenKind, Map<number, NumericToken>> = {
    year: new Map(),
    age: new Map(),
    number: new Map(),
  };
  for (const t of a) if (!aByKind[t.kind].has(t.value)) aByKind[t.kind].set(t.value, t);
  for (const t of b) if (!bByKind[t.kind].has(t.value)) bByKind[t.kind].set(t.value, t);

  for (const kind of ["year", "age", "number"] as TokenKind[]) {
    const am = aByKind[kind];
    const bm = bByKind[kind];
    if (am.size === 0 || bm.size === 0) continue;
    for (const [val, at] of am) {
      for (const [bval, bt] of bm) {
        if (bval !== val) {
          const msg = `同为${kindLabel(kind)}却不一致：${at.raw} vs ${bt.raw}`;
          if (!seen.has(msg)) {
            seen.add(msg);
            conflicts.push(msg);
          }
          break; // 该 kind 已找到一处差异即标记
        }
      }
    }
  }
  return conflicts;
}

function kindLabel(k: TokenKind): string {
  if (k === "year") return "年份";
  if (k === "age") return "年龄";
  return "数值";
}

/** 主题重叠判定（同一话题才比较，避免无关数字误报） */
export function topicOverlap(a?: string, b?: string): boolean {
  const sa = (a || "").trim().toLowerCase();
  const sb = (b || "").trim().toLowerCase();
  if (!sa || !sb) return false; // 任一缺主题都不比较，降低误报
  if (sa === sb) return true;
  if (sa.includes(sb) || sb.includes(sa)) return true;
  // 取较短字符串做子串/关键词粗匹配
  const shorter = sa.length <= sb.length ? sa : sb;
  const longer = sa.length <= sb.length ? sb : sa;
  return longer.split(/[\s,，。、/]+/).some((tok) => tok.length >= 2 && shorter.includes(tok));
}
