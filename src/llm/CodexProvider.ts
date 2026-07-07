import { OpenAIProvider } from "./OpenAIProvider";
import { LLMChatSettings } from "../settings";

/**
 * Codex Provider — 基于 OpenAI 兼容 API，专用于 OpenAI Codex CLI 模型
 * 复用 OpenAIProvider 的 API 调用逻辑，使用独立配置
 */
export class CodexProvider extends OpenAIProvider {
  constructor(settings: LLMChatSettings) {
    // 临时替换 settings 中的 openai 字段为 codex 字段
    const adaptedSettings: LLMChatSettings = {
      ...settings,
      openaiApiKey: settings.codexApiKey,
      openaiBaseUrl: settings.codexBaseUrl,
      openaiModel: settings.codexModel,
    };
    super(adaptedSettings);
  }

  name = "Codex";
}
