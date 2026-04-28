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
    expect(store.get().languagePreference).toBe('system')
    expect(store.isSelectionToolbarEnabled()).toBe(false)
    expect(store.getDictionaryEntries()).toHaveLength(2)
    expect(store.getPostProcessPreset()).toBe('formal')
    expect(store.getPostProcessPresets()).toHaveLength(2)
    expect(store.hasDashscopeApiKey()).toBe(false)

    store.setThemeMode('dark')
    expect(store.get().themeMode).toBe('dark')

    store.appendHistory({
      id: '1',
      createdAt: Date.now(),
      transcript: 'hello',
      cleanedText: 'Hello.',
      status: 'completed',
      llmProcessing: 'completed'
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

  it('persists provider, microphone, preset, language, feature, and OpenAI key settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-provider-'))
    const firstStore = createSettingsStore('MetaRight', root)

    firstStore.setProvider('openai')
    firstStore.setProviderLlmModel('openai', 'gpt-4.1-mini')
    firstStore.setPostProcessPreset('casual')
    firstStore.setLanguagePreference('zh-TW')
    firstStore.setSelectionToolbarEnabled(true)
    const dictionaryEntry = firstStore.saveDictionaryEntry({
      phrase: 'build mine',
      replacement: 'BuildMind',
      notes: 'Brand casing'
    })
    firstStore.setOpenAiApiKey('openai-test-key')
    firstStore.setHotkey('AltRight')
    firstStore.setMicrophone({
      deviceId: 'usb-mic-1',
      label: 'USB Microphone'
    })

    const secondStore = createSettingsStore('MetaRight', root)
    expect(secondStore.getProvider()).toBe('openai')
    expect(secondStore.hasOpenAiApiKey()).toBe(true)
    expect(secondStore.get().providers).toEqual({
      asr: 'gpt-4o-mini-transcribe',
      llm: 'gpt-4.1-mini'
    })
    expect(secondStore.getProviderModels('dashscope')).toEqual({
      asr: 'qwen3-asr-flash',
      llm: 'qwen3.5-flash'
    })
    expect(secondStore.getProviderModels('openai')).toEqual({
      asr: 'gpt-4o-mini-transcribe',
      llm: 'gpt-4.1-mini'
    })
    expect(secondStore.getPostProcessPreset()).toBe('casual')
    expect(secondStore.get().languagePreference).toBe('zh-TW')
    expect(secondStore.isSelectionToolbarEnabled()).toBe(true)
    expect(secondStore.getDictionaryEntries()).toContainEqual(dictionaryEntry)
    expect(secondStore.get().hotkey).toBe('AltRight')
    expect(secondStore.getMicrophone()).toEqual({
      deviceId: 'usb-mic-1',
      label: 'USB Microphone'
    })

    rmSync(root, { recursive: true, force: true })
  })

  it('can remove persisted dictionary entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-dictionary-'))
    const firstStore = createSettingsStore('MetaRight', root)
    const entry = firstStore.saveDictionaryEntry({
      phrase: 'queue you',
      replacement: 'Qwen',
      notes: ''
    })

    firstStore.deleteDictionaryEntry(entry.id)

    const secondStore = createSettingsStore('MetaRight', root)
    expect(secondStore.getDictionaryEntries().some((item) => item.id === entry.id)).toBe(false)

    rmSync(root, { recursive: true, force: true })
  })

  it('normalizes unsupported llm model choices back to the provider default', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-llm-normalize-'))
    const store = createSettingsStore('MetaRight', root)

    store.setProviderLlmModel('dashscope', 'not-a-real-model')
    expect(store.getProviderModels('dashscope')).toEqual({
      asr: 'qwen3-asr-flash',
      llm: 'qwen3.5-flash'
    })

    store.setProviderLlmModel('openai', 'gpt-5-nano')
    expect(store.getProviderModels('openai')).toEqual({
      asr: 'gpt-4o-mini-transcribe',
      llm: 'gpt-5-nano'
    })

    rmSync(root, { recursive: true, force: true })
  })

  it('allows editing, resetting, and adding post-process presets', () => {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-settings-presets-'))
    const firstStore = createSettingsStore('MetaRight', root)

    const formal = firstStore.getSelectedPostProcessPreset()
    expect(formal.id).toBe('formal')

    firstStore.savePostProcessPreset({
      id: 'formal',
      name: 'Formal',
      systemPrompt: 'Keep the wording polished and concise.',
      enablePostProcessing: false
    })
    expect(firstStore.getSelectedPostProcessPreset().systemPrompt).toBe(
      'Keep the wording polished and concise.'
    )
    expect(firstStore.getSelectedPostProcessPreset().enablePostProcessing).toBe(false)

    firstStore.resetPostProcessPreset('formal')
    expect(firstStore.getSelectedPostProcessPreset().systemPrompt).toBe(
      'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.'
    )
    expect(firstStore.getSelectedPostProcessPreset().enablePostProcessing).toBe(true)

    const customPreset = firstStore.createPostProcessPreset({
      name: 'Support',
      systemPrompt: 'Sound warm, clear, and customer-friendly.',
      enablePostProcessing: false
    })

    expect(firstStore.getPostProcessPreset()).toBe(customPreset.id)
    expect(firstStore.getSelectedPostProcessPreset().systemPrompt).toBe(
      'Sound warm, clear, and customer-friendly.'
    )

    const secondStore = createSettingsStore('MetaRight', root)
    expect(secondStore.getPostProcessPresets().map((preset) => preset.name)).toContain('Support')
    expect(
      secondStore.getPostProcessPresets().find((preset) => preset.id === 'formal')?.systemPrompt
    ).toBe(
      'Prefer polished punctuation, complete sentences, and a professional tone while preserving the speaker intent, wording, and meaning.'
    )
    expect(
      secondStore.getPostProcessPresets().find((preset) => preset.id === customPreset.id)
        ?.enablePostProcessing
    ).toBe(false)

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
          llm: 'qwen3.5-flash'
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
