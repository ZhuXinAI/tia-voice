import type { ElectronBridge, TiaApi } from './index'

declare global {
  interface Window {
    electron: ElectronBridge
    api: TiaApi
  }
}

export {}
