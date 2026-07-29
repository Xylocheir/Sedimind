// 集中常量，替代散落的魔法数字（rules.md §1.3 / C3）
export const RETRIEVAL_STEP = 0.05;
export const CITATION_WEIGHT = 0.1;
export const SURVIVAL_BASE = 0.5;
export const NOVELTY_TIME_DECAY_DAYS = 30;
export const EXPLORE_BOOST_FROM_CONFLICT = 0.3;

// 派生/张力命题权重（与 settings.sedimentWeight 同源，仅作默认值兜底）
export const BEDROCK_LOW_WEIGHT = 0.3;
export const VEIN_LOW_WEIGHT = 0.2;

// 目录约定
export const DERIVED_DIR = "derived";
export const BEDROCK_DIR = "bedrock";

// 每日衰减默认系数（settings.sedimentDecay.dailyFactor 缺省用此）
export const DEFAULT_DECAY_FACTOR = 0.9;

// —— Phase 3 主动进化 ——
export const WORMHOLE_COOLDOWN_MS = 8000; // 单文件两次扫描最小间隔（防抖动/防刷）
export const WORMHOLE_MAX_NOTE_BYTES = 20000; // 超出则跳过扫描
export const WORMHOLE_SAMPLE_ENTRIES = 12; // 提供给 LLM 的高反差认知节点样本数
export const HYBRID_OLD_DAYS = 30; // 杂交只取 >30 天的旧节点
export const HYBRID_PICK = 3; // 单次最多杂交节点数
export const HYBRID_LOW_WEIGHT_FACTOR = 0.3; // 初始低权 = survival * factor
export const HYBRID_CONFIRM_BOOST = 2; // 确认升权倍率（封顶 1）
export const COMPACTION_MIN_MEMBERS = 3; // 参与压实最少化石数
