import { describe, expect, it, vi } from 'vitest'

import { createMicrophonePermissionState } from './microphonePermissionState'

describe('createMicrophonePermissionState', () => {
  it('keeps non-macOS platforms granted', async () => {
    const getStatus = vi.fn(() => 'denied' as const)
    const askForAccess = vi.fn().mockResolvedValue(false)
    const state = createMicrophonePermissionState({
      platform: 'win32',
      getStatus,
      askForAccess
    })

    expect(state.getSnapshot()).toEqual({
      granted: true,
      status: 'granted'
    })
    await expect(state.check(true)).resolves.toBe(true)
    expect(getStatus).not.toHaveBeenCalled()
    expect(askForAccess).not.toHaveBeenCalled()
  })

  it('treats a renderer-confirmed grant as granted while macOS catches up', () => {
    const getStatus = vi.fn(() => 'not-determined' as const)
    const state = createMicrophonePermissionState({
      platform: 'darwin',
      getStatus,
      askForAccess: vi.fn().mockResolvedValue(false)
    })

    expect(state.getSnapshot()).toEqual({
      granted: false,
      status: 'not-determined'
    })

    state.confirmGranted()

    expect(state.getSnapshot()).toEqual({
      granted: true,
      status: 'granted'
    })
  })

  it('keeps the permission granted after a successful native prompt until status updates', async () => {
    let nativeStatus: 'not-determined' | 'granted' = 'not-determined'
    const askForAccess = vi.fn().mockImplementation(async () => true)
    const state = createMicrophonePermissionState({
      platform: 'darwin',
      getStatus: () => nativeStatus,
      askForAccess
    })

    await expect(state.check(true)).resolves.toBe(true)
    expect(askForAccess).toHaveBeenCalledOnce()
    expect(state.getSnapshot()).toEqual({
      granted: true,
      status: 'granted'
    })

    nativeStatus = 'granted'

    expect(state.getSnapshot()).toEqual({
      granted: true,
      status: 'granted'
    })
  })

  it('drops the inferred grant once macOS reports denial', () => {
    let nativeStatus: 'not-determined' | 'denied' = 'not-determined'
    const state = createMicrophonePermissionState({
      platform: 'darwin',
      getStatus: () => nativeStatus,
      askForAccess: vi.fn().mockResolvedValue(false)
    })

    state.confirmGranted()
    expect(state.getSnapshot()).toEqual({
      granted: true,
      status: 'granted'
    })

    nativeStatus = 'denied'

    expect(state.getSnapshot()).toEqual({
      granted: false,
      status: 'denied'
    })
  })
})
