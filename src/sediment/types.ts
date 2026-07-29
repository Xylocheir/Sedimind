// 沉积层类型定义（Phase 1 + Phase 2 演进式扩展）
// 注意：为兼容存量代码，旧字段（layer/timestamp/source_file/survival_score 等）保留；
// Phase 2 视图层由 projection.projectLayer 按 age 动态计算，存储的 layer 视为遗留字段。

export type SedimentStatus = "active" | "superseded" | "conflicted";
export type SedimentLayer = "L1" | "L2" | "L3";
export type FilterAction = "evaporate" | "record" | "mark_high";

export interface FilterResult {
  action: FilterAction;
  reason?: string;
}

/** 化石相（认知节点的性质） */
export type Facies =
  | "assumption" // 前提假设
  | "reasoning" // 推理链
  | "conclusion" // 结论
  | "question" // 疑问
  | "decision" // 决策
  | "correction" // 用户纠正
  | "reference"; // 引用

/** 立场：pro 支持 / con 反对 / neutral 中立 / tension 处于张力中 */
export type Stance = "pro" | "con" | "neutral" | "tension";

export interface SedimentIndexEntry {
  id: string;
  layer: SedimentLayer; // 遗留字段，视图层以 projectLayer 为准
  timestamp: number; // 秒
  survival_score: number;
  novelty_score: number;
  explore_boost: number;
  status: SedimentStatus;
  topic: string;
  source_file: string;
  citation_count: number;
  retrieval_count: number;
  // —— Phase 2 新增（可选，兼容旧索引）——
  facies?: Facies;
  stance?: Stance;
  cross_cutting?: string[]; // 相关 FaultRecord.id
}

/** L3 张力命题（Phase 2 落地）：tension 是核心（活的、可修订），assertion 只是当前倾向 */
export type BedrockStatus = "open" | "resolved" | "rejected";
export interface BedrockTenet {
  id: string;
  path: string;
  tension: string; // 两股力量为何紧张（核心，非结论）
  assertion: string; // 当前倾向性表述（可被 adjudicate 推翻）
  source_ids: string[]; // 派生来源（化石 id）
  status: BedrockStatus; // 默认 open
  created: number;
  updated: number;
  weight: number; // 与 survival 同口径，初始低
}

export interface FaultRecord {
  id: string;
  a_id: string;
  b_id: string; // 冲突双方化石 id
  kind: "factual" | "preference" | "plan";
  summary: string;
  status: "open" | "adjudicated";
  resolved_by?: string; // BedrockTenet.id
  created: number;
  /** 由启发式矛盾预筛（零 LLM）产生，而非 LLM 断层检测 */
  prescreen?: boolean;
}

export interface VeinRecord {
  id: string;
  member_ids: string[]; // 聚类成员化石 id
  label: string; // 主题聚类标签
  survival_score: number; // 初始低，确认后升权
  confirmed: boolean;
  created: number;
}

// —— Phase 3 主动进化 ——
export type WormholeRelation = "contradiction" | "resonance" | "evolution";

/** 实时虫洞命中：编辑笔记时与沉积层认知节点之间的对照 */
export interface WormholeHit {
  id: string;
  relation: WormholeRelation; // 矛盾 / 呼应 / 演化
  note_excerpt: string; // 笔记中触发对照的片段
  sediment_excerpt: string; // 沉积层中对应的认知节点片段
  explanation: string;
  created: number; // ms
}

/** 认知杂交产物（受控：默认低权，标「有启发」才升权） */
export interface HybridInsight {
  id: string;
  title: string;
  synthesis: string; // 杂交出的灵感（非结论）
  node_ids: string[]; // 来源化石 id（均 >30 天）
  weight: number; // 初始低权 = survival * 0.3
  confirmed: boolean; // 标「有启发」才升权
  created: number;
}

/** 周期性压实清单（记录上次压实时间） */
export interface CompactionManifest {
  lastCompact: number | null; // 秒
}

/** 单次压实记录（独立派生摘要，化石内容不可变） */
export interface CompactionRecord {
  id: string;
  period: string; // YYYY-MM
  summary: string;
  key_tenets: string[];
  member_ids: string[];
  superseded_ids: string[];
  created: number;
}

export interface SurvivalScore {
  survival: number;
  novelty: number;
  explore_boost: number;
}
export interface NoveltyScore {
  score: number;
  reason: string;
}
export interface ExploreBoost {
  boost: number;
  related_ids: string[];
}

export interface InjectionContext {
  blocks: { path: string; excerpt: string; score: number }[];
  tokens: number;
}

export type StatusBarState = "idle" | "depositing" | "conflict";

export interface GravityRulesConfig {
  minLength: number;
  highPriorityMinLength: number;
}

export interface BriefingConfig {
  outputDir: string;
  deviceName: string;
  folderName?: string;
}
