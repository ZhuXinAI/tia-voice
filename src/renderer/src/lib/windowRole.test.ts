import { describe, expect, it } from 'vitest'
import { getWindowRoleFromLocation } from './windowRole'

describe('getWindowRoleFromLocation', () => {
  it('falls back to main-app for unknown roles', () => {
    expect(getWindowRoleFromLocation('?window=unknown')).toBe('main-app')
  })

  it('reads the recording bar role from the query string', () => {
    expect(getWindowRoleFromLocation('?window=recording-bar')).toBe('recording-bar')
  })

  it('falls back to main-app for the legacy onboarding role', () => {
    expect(getWindowRoleFromLocation('?window=onboarding')).toBe('main-app')
  })
})
