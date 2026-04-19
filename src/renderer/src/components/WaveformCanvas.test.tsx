// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WaveformCanvas } from './WaveformCanvas'

describe('WaveformCanvas', () => {
  it('renders the recording canvas shell', () => {
    render(<WaveformCanvas stream={null} />)
    expect(screen.getByTestId('waveform-canvas')).toBeInTheDocument()
  })
})
