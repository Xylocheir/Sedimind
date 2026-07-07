import { AnthropicProvider } from "./AnthropicProvider";
import { LLMChatSettings } from "../settings";

/**
 * Claude Code Provider — 基于 Anthropic Messages API，专用于 Claude Code CLI 模型
 * 复用 AnthropicProvider 的 API 调用逻辑，使用独立配置
 */
export class ClaudeCodeProvider extends AnthropicProvider {
  constructor(settings: LLMChatSettings) {
    // 替换 settings 中的 anthropic 字段为 claude-code 字段
    const adaptedSettings: LLMChatSettings = {
      ...settings,
      anthropicApiKey: settings.claudeCodeApiKey,
      anthropicModel: settings.claudeCodeModel,
    };
    super(adaptedSettings, settings.claudeCodeBaseUrl);
  }

  name = "Claude Code";
}
