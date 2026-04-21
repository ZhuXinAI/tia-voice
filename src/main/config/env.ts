import { z } from 'zod'

export type TriggerKey = 'MetaRight' | 'AltRight' | 'ControlRight'
export const DEFAULT_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

const envSchema = z.object({
  DASHSCOPE_BASE_URL: z.string().url().optional()
})

export type AppEnv = {
  dashscopeBaseUrl: string
  pushToTalkKey: TriggerKey
}

export function loadAppEnv(input: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv }): AppEnv {
  const parsed = envSchema.parse(input.env)
  const dashscopeBaseUrl = parsed.DASHSCOPE_BASE_URL ?? DEFAULT_DASHSCOPE_BASE_URL

  return {
    dashscopeBaseUrl,
    pushToTalkKey:
      input.platform === 'darwin'
        ? 'MetaRight'
        : input.platform === 'win32'
          ? 'ControlRight'
          : 'AltRight'
  }
}
