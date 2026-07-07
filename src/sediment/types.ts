export type SedimentStatus = "active" | "superseded" | "conflicted";
export type SedimentLayer = "L1" | "L2" | "L3";
export type FilterAction = "evaporate" | "record" | "mark_high";

export interface FilterResult {
  action: FilterAction;
  reason?: string;
}

export interface SedimentIndexEntry {
  id: string;
  layer: SedimentLayer;
  timestamp: number;        // unix 秒
  survival_score: number;   // [0,1]
  novelty_score: number;    // [0,1]
  explore_boost: number;    // [0,1]
  status: SedimentStatus;
  topic: string;
  source_file: string;      // 相对 vault 路径
  citation_count: number;
  retrieval_count: number;
}

export interface BedrockTenet {
  // Phase 2 预留，只需定义接口不实现
  id: string; content: string; summary: string;
  created_at: number; last_used_at: number;
  confidence_score: number; status: SedimentStatus;
  conflicts_with: string[]; context_condition: string;
}

export type StatusBarState = "idle" | "depositing" | "conflict";

export interface GravityRulesConfig {
  minLength: number;                // 默认 10
  highPriorityMinLength: number;    // 默认 200
}

export interface BriefingConfig {
  outputDir: string;      // 默认 ".sediment/briefings"
  deviceName: string;     // 默认 "default"
}
