import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { listPackage } from '@electron/asar'

const REQUIRED_PACKAGE_PATHS = [
  '/node_modules/electron-updater/package.json',
  '/node_modules/builder-util-runtime/package.json',
  '/node_modules/debug/package.json',
  '/node_modules/ms/package.json'
]

function normalizeArchiveEntryPath(entryPath) {
  return `/${String(entryPath).replace(/\\/g, '/').replace(/^\/+/, '')}`
}

function resolveAsarPath(inputPath) {
  const absolutePath = resolve(inputPath)

  if (absolutePath.endsWith('.asar')) {
    return absolutePath
  }

  const macAsarPath = join(absolutePath, 'Contents', 'Resources', 'app.asar')
  if (existsSync(macAsarPath)) {
    return macAsarPath
  }

  const windowsAsarPath = join(absolutePath, 'resources', 'app.asar')
  if (existsSync(windowsAsarPath)) {
    return windowsAsarPath
  }

  if (absolutePath.endsWith('.app')) {
    return macAsarPath
  }

  if (absolutePath.endsWith('.exe')) {
    return join(resolve(absolutePath, '..'), 'resources', 'app.asar')
  }

  return windowsAsarPath
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const inputPath = args[0]

  if (!inputPath) {
    console.error('Usage: node scripts/verifyPackagedRuntimeDeps.mjs <path-to-app-or-app.asar>')
    process.exit(1)
  }

  const asarPath = resolveAsarPath(inputPath)
  if (!existsSync(asarPath)) {
    console.error(`Packaged app archive not found at ${asarPath}`)
    process.exit(1)
  }

  const entries = new Set(listPackage(asarPath).map(normalizeArchiveEntryPath))
  const missing = REQUIRED_PACKAGE_PATHS.filter((entry) => !entries.has(normalizeArchiveEntryPath(entry)))

  if (missing.length > 0) {
    console.error(`Missing packaged runtime dependencies in ${asarPath}:`)
    for (const entry of missing) {
      console.error(`- ${entry}`)
    }
    process.exit(1)
  }

  console.log(`Verified packaged runtime dependencies in ${asarPath}`)
}

main()
