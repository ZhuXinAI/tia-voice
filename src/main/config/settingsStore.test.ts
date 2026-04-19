import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { createSettingsStore } from './settingsStore'

describe('createSettingsStore', () => {
  it('returns the default provider configuration and tracks history', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-'))
    const store = createSettingsStore('MetaRight', root)
    expect(store.get().providers.asr).toBe('qwen3-asr-flash')
    expect(store.get().themeMode).toBe('system')
    expect(store.hasDashscopeApiKey()).toBe(false)

    store.setThemeMode('dark')
    expect(store.get().themeMode).toBe('dark')

    store.appendHistory({
      id: '1',
      createdAt: Date.now(),
      transcript: 'hello',
      cleanedText: 'Hello.',
      status: 'completed'
    })

    expect(store.get().history).toHaveLength(1)
    rmSync(root, { recursive: true, force: true })
  })

  it('tracks onboarding completion locally even when setup is skipped', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-onboarding-skip-'))

    const firstStore = createSettingsStore('MetaRight', root)
    expect(firstStore.isOnboardingComplete()).toBe(false)

    firstStore.markOnboardingComplete()
    expect(firstStore.isOnboardingComplete()).toBe(true)

    const secondStore = createSettingsStore('MetaRight', root)
    expect(secondStore.isOnboardingComplete()).toBe(true)
    expect(secondStore.hasDashscopeApiKey()).toBe(false)

    rmSync(root, { recursive: true, force: true })
  })

  it('tracks onboarding completion locally after a DashScope key is saved', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-onboarding-'))

    const firstStore = createSettingsStore('MetaRight', root)
    expect(firstStore.isOnboardingComplete()).toBe(false)
    firstStore.setDashscopeApiKey('dashscope-test-key')
    expect(firstStore.getDashscopeKeyLabel()).toContain('test-key'.slice(-4))

    firstStore.markOnboardingComplete()
    expect(firstStore.isOnboardingComplete()).toBe(true)

    const secondStore = createSettingsStore('MetaRight', root)
    expect(secondStore.hasDashscopeApiKey()).toBe(true)
    expect(secondStore.isOnboardingComplete()).toBe(true)

    secondStore.clearOnboardingCompletion()
    expect(secondStore.isOnboardingComplete()).toBe(false)

    const thirdStore = createSettingsStore('MetaRight', root)
    expect(thirdStore.isOnboardingComplete()).toBe(false)
    expect(thirdStore.hasDashscopeApiKey()).toBe(true)

    rmSync(root, { recursive: true, force: true })
  })

  it('migrates legacy onboarding completion data', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-legacy-onboarding-'))
    writeFileSync(
      join(root, 'settings.json'),
      JSON.stringify({
        hotkey: 'MetaRight',
        themeMode: 'system',
        providers: {
          asr: 'qwen3-asr-flash',
          llm: 'qwen-plus'
        },
        dashscopeApiKey: 'dashscope-test-key',
        history: [],
        onboarding: {
          completedUserIds: ['legacy-user-id']
        }
      }),
      'utf8'
    )

    const store = createSettingsStore('MetaRight', root)
    expect(store.isOnboardingComplete()).toBe(true)

    rmSync(root, { recursive: true, force: true })
  })
})
