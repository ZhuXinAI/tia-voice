import { z } from 'zod'

export type TriggerKey = 'MetaRight' | 'AltRight' | 'ControlRight'
export const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const DEFAULT_DASHSCOPE_API_BASE_URL = 'https://dashscope.aliyuncs.com'

const envSchema = z.object({
  DASHSCOPE_BASE_URL: z.string().url().optional(),
  DASHSCOPE_API_BASE_URL: z.string().url().optional()
})

export type AppEnv = {
  dashscopeBaseUrl: string
  dashscopeApiBaseUrl: string
  pushToTalkKey: TriggerKey
}

export function loadAppEnv(input: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv }): AppEnv {
  const parsed = envSchema.parse(input.env)
  const dashscopeBaseUrl = parsed.DASHSCOPE_BASE_URL ?? DEFAULT_DASHSCOPE_BASE_URL
  const dashscopeApiBaseUrl = parsed.DASHSCOPE_API_BASE_URL ?? DEFAULT_DASHSCOPE_API_BASE_URL

  return {
    dashscopeBaseUrl,
    dashscopeApiBaseUrl,
    pushToTalkKey:
      input.platform === 'darwin'
        ? 'MetaRight'
        : input.platform === 'win32'
          ? 'ControlRight'
          : 'AltRight'
  }
}
