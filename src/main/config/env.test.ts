import { describe, expect, it } from 'vitest'

import { loadAppEnv } from './env'

describe('loadAppEnv', () => {
  it('returns platform-specific defaults without requiring provider secrets in env', () => {
    const darwinLoaded = loadAppEnv({ platform: 'darwin', env: {} as NodeJS.ProcessEnv })
    expect(darwinLoaded.pushToTalkKey).toBe('MetaRight')
    expect(darwinLoaded.dashscopeBaseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')

    const loaded = loadAppEnv({ platform: 'win32', env: {} as NodeJS.ProcessEnv })

    expect(loaded.pushToTalkKey).toBe('AltRight')
    expect(loaded.dashscopeBaseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
  })

  it('applies a custom DashScope base URL', () => {
    const loaded = loadAppEnv({
      platform: 'darwin',
      env: { DASHSCOPE_BASE_URL: 'https://dashscope-proxy.internal/v1' } as NodeJS.ProcessEnv
    })
    expect(loaded.dashscopeBaseUrl).toBe('https://dashscope-proxy.internal/v1')
  })
})
