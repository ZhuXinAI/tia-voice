// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders the correct window shell for the recording role', () => {
    render(<App initialWindowRole="recording-bar" />)
    expect(screen.getByTestId('recording-bar-window')).toBeInTheDocument()
  })

  it('renders the main app shell for the main-app role', async () => {
    render(<App initialWindowRole="main-app" />)
    expect(await screen.findByText(/workspace/i)).toBeInTheDocument()
  })
})
