export type SupportedProviderKind = 'dashscope' | 'openai'

export type ProviderModelSelection = {
  asr: string
  llm: string
}

type ProviderModelCatalog = ProviderModelSelection & {
  llmOptions: readonly string[]
}

// OpenAI options are a curated text-model list for transcript cleanup, verified
// against the official model docs on 2026-04-22.
const PROVIDER_MODEL_CATALOG: Record<SupportedProviderKind, ProviderModelCatalog> = {
  dashscope: {
    asr: 'qwen3-asr-flash',
    llm: 'qwen3.5-flash',
    llmOptions: [
      'qwen3-max',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'qwen-plus',
      'qwen3.6-flash',
      'qwen3.5-flash',
      'qwen-flash'
    ]
  },
  openai: {
    asr: 'gpt-4o-mini-transcribe',
    llm: 'gpt-5-mini',
    llmOptions: [
      'gpt-5.2',
      'gpt-5.1',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'o3',
      'o4-mini',
      'o3-mini'
    ]
  }
}

export function getDefaultProviderModels(provider: SupportedProviderKind): ProviderModelSelection {
  const entry = PROVIDER_MODEL_CATALOG[provider]
  return {
    asr: entry.asr,
    llm: entry.llm
  }
}

export function getAvailableLlmModels(provider: SupportedProviderKind): string[] {
  return [...PROVIDER_MODEL_CATALOG[provider].llmOptions]
}

export function isSupportedLlmModel(provider: SupportedProviderKind, model: string): boolean {
  return PROVIDER_MODEL_CATALOG[provider].llmOptions.includes(model)
}

export function normalizeProviderLlmModel(
  provider: SupportedProviderKind,
  model: unknown
): string {
  return typeof model === 'string' && isSupportedLlmModel(provider, model)
    ? model
    : PROVIDER_MODEL_CATALOG[provider].llm
}
