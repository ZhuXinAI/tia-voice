import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { listPackage } from '@electron/asar'

const REQUIRED_PACKAGES = [
  'electron-updater',
  'builder-util-runtime',
  'debug',
  'ms',
  'jimp',
  '@jimp/custom',
  '@jimp/core',
  '@jimp/types',
  '@jimp/plugins',
  '@jimp/utils',
  '@jimp/bmp',
  '@jimp/gif',
  '@jimp/jpeg',
  '@jimp/png',
  '@jimp/tiff',
  '@jimp/plugin-blit',
  '@jimp/plugin-blur',
  '@jimp/plugin-circle',
  '@jimp/plugin-color',
  '@jimp/plugin-contain',
  '@jimp/plugin-cover',
  '@jimp/plugin-crop',
  '@jimp/plugin-displace',
  '@jimp/plugin-dither',
  '@jimp/plugin-fisheye',
  '@jimp/plugin-flip',
  '@jimp/plugin-gaussian',
  '@jimp/plugin-invert',
  '@jimp/plugin-mask',
  '@jimp/plugin-normalize',
  '@jimp/plugin-print',
  '@jimp/plugin-resize',
  '@jimp/plugin-rotate',
  '@jimp/plugin-scale',
  '@jimp/plugin-shadow',
  '@jimp/plugin-threshold',
  'regenerator-runtime',
  '@nut-tree-fork/nut-js',
  '@nut-tree-fork/shared',
  '@nut-tree-fork/provider-interfaces',
  '@nut-tree-fork/default-clipboard-provider',
  '@nut-tree-fork/libnut'
]

const REQUIRED_PACKAGE_PATHS = REQUIRED_PACKAGES.map(
  (packageName) => `/node_modules/${packageName}/package.json`
)

function normalizeArchiveEntryPath(entryPath) {
  return `/${String(entryPath).replace(/\\/g, '/').replace(/^\/+/, '')}`
}

function collectAsarPathsFromDirectory(directoryPath, maxDepth = 4, depth = 0, found = new Set()) {
  if (depth > maxDepth || !existsSync(directoryPath)) {
    return found
  }

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const absoluteEntryPath = join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue
      }

      if (entry.name.endsWith('.app')) {
        const appAsarPath = join(absoluteEntryPath, 'Contents', 'Resources', 'app.asar')
        if (existsSync(appAsarPath)) {
          found.add(appAsarPath)
          continue
        }
      }

      collectAsarPathsFromDirectory(absoluteEntryPath, maxDepth, depth + 1, found)
      continue
    }

    if (entry.isFile() && entry.name === 'app.asar') {
      found.add(absoluteEntryPath)
    }
  }

  return found
}

function resolveAsarPaths(inputPath) {
  const absolutePath = resolve(inputPath)

  if (absolutePath.endsWith('.asar')) {
    return [absolutePath]
  }

  const macAsarPath = join(absolutePath, 'Contents', 'Resources', 'app.asar')
  if (existsSync(macAsarPath)) {
    return [macAsarPath]
  }

  const windowsAsarPath = join(absolutePath, 'resources', 'app.asar')
  if (existsSync(windowsAsarPath)) {
    return [windowsAsarPath]
  }

  if (absolutePath.endsWith('.app')) {
    return [macAsarPath]
  }

  if (absolutePath.endsWith('.exe')) {
    return [join(resolve(absolutePath, '..'), 'resources', 'app.asar')]
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    return [...collectAsarPathsFromDirectory(absolutePath)].sort()
  }

  return [windowsAsarPath]
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const inputPath = args[0]

  if (!inputPath) {
    console.error('Usage: node scripts/verifyPackagedRuntimeDeps.mjs <path-to-app-or-app.asar>')
    process.exit(1)
  }

  const asarPaths = resolveAsarPaths(inputPath).filter((asarPath) => existsSync(asarPath))
  if (asarPaths.length === 0) {
    console.error(`Packaged app archive not found for ${resolve(inputPath)}`)
    process.exit(1)
  }

  let hasMissingEntries = false

  for (const asarPath of asarPaths) {
    const entries = new Set(listPackage(asarPath).map(normalizeArchiveEntryPath))
    const missing = REQUIRED_PACKAGE_PATHS.filter(
      (entry) => !entries.has(normalizeArchiveEntryPath(entry))
    )

    if (missing.length > 0) {
      hasMissingEntries = true
      console.error(`Missing packaged runtime dependencies in ${asarPath}:`)
      for (const entry of missing) {
        console.error(`- ${entry}`)
      }
      continue
    }

    console.log(`Verified packaged runtime dependencies in ${asarPath}`)
  }

  if (hasMissingEntries) {
    process.exit(1)
  }
}

main()
