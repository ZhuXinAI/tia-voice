import { beforeEach, describe, expect, it, vi } from 'vitest'

const { checkMicrophonePermissionMock, openPermissionSettingsMock } = vi.hoisted(() => ({
  checkMicrophonePermissionMock: vi.fn(),
  openPermissionSettingsMock: vi.fn()
}))

vi.mock('./ipc', () => ({
  checkMicrophonePermission: checkMicrophonePermissionMock,
  openPermissionSettings: openPermissionSettingsMock
}))

import { probeMicrophoneAccess, requestMicrophonePermission } from './microphoneAccess'

describe('probeMicrophoneAccess', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    checkMicrophonePermissionMock.mockReset()
    openPermissionSettingsMock.mockReset()
  })

  it('resolves true and stops tracks after a successful probe', async () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }]
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    })

    await expect(probeMicrophoneAccess()).resolves.toBe(true)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(stop).toHaveBeenCalledOnce()
  })

  it('returns false when the renderer probe fails', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    })

    await expect(probeMicrophoneAccess()).resolves.toBe(false)
  })
})

describe('requestMicrophonePermission', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    checkMicrophonePermissionMock.mockReset()
    openPermissionSettingsMock.mockReset()
  })

  it('does not open settings when the renderer probe succeeds', async () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }]
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    })

    await expect(requestMicrophonePermission()).resolves.toBe(true)
    expect(openPermissionSettingsMock).not.toHaveBeenCalled()
    expect(checkMicrophonePermissionMock).not.toHaveBeenCalled()
  })

  it('falls back to System Settings when the renderer probe fails', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    })

    openPermissionSettingsMock.mockResolvedValue(undefined)
    checkMicrophonePermissionMock.mockResolvedValue(false)

    await expect(requestMicrophonePermission()).resolves.toBe(false)
    expect(openPermissionSettingsMock).toHaveBeenCalledWith('microphone')
    expect(checkMicrophonePermissionMock).toHaveBeenCalledWith(false)
  })
})
