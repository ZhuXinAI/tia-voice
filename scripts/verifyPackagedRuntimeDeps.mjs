import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { listPackage } from '@electron/asar'

const ROOT_RUNTIME_PACKAGES = [
  'electron-updater',
  'jimp',
  '@nut-tree-fork/nut-js'
]

function normalizeArchiveEntryPath(entryPath) {
  return `/${String(entryPath).replace(/\\/g, '/').replace(/^\/+/, '')}`
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function findPackageRoot(resolvedEntryPath) {
  let currentPath = dirname(resolvedEntryPath)

  while (true) {
    const packageJsonPath = join(currentPath, 'package.json')
    if (existsSync(packageJsonPath)) {
      const packageJson = readJsonFile(packageJsonPath)
      if (typeof packageJson.name === 'string' && packageJson.name.length > 0) {
        return currentPath
      }
    }

    const parentPath = dirname(currentPath)
    if (parentPath === currentPath) {
      throw new Error(`Could not locate package.json for resolved path ${resolvedEntryPath}`)
    }

    currentPath = parentPath
  }
}

function resolveInstalledPackage(packageName, fromPackageRoot) {
  const requireFromPackage = createRequire(resolve(fromPackageRoot, 'package.json'))
  const resolvedEntryPath = requireFromPackage.resolve(packageName)
  if (!isAbsolute(resolvedEntryPath)) {
    return null
  }

  const packageRoot = findPackageRoot(resolvedEntryPath)
  const packageJson = readJsonFile(join(packageRoot, 'package.json'))

  return {
    name: packageJson.name,
    packageRoot,
    packageJson
  }
}

function collectRequiredPackagePaths() {
  const queue = ROOT_RUNTIME_PACKAGES.map((packageName) => ({
    fromPackageRoot: process.cwd(),
    isOptional: false,
    isRoot: true,
    packageName
  }))
  const requiredPackageNames = new Set()
  const unresolvedTransitivePackages = []
  const visitedPackages = new Set()

  while (queue.length > 0) {
    const current = queue.shift()

    let resolvedPackage
    try {
      resolvedPackage = resolveInstalledPackage(current.packageName, current.fromPackageRoot)
    } catch (error) {
      if (current.isOptional) {
        continue
      }

      const message = error instanceof Error ? error.message : String(error)
      if (current.isRoot) {
        console.error(`Could not resolve required runtime root package ${current.packageName}:`)
        console.error(`- from ${current.fromPackageRoot}`)
        console.error(`- ${message}`)
        process.exit(1)
      }

      unresolvedTransitivePackages.push({
        packageName: current.packageName,
        fromPackageRoot: current.fromPackageRoot,
        message
      })
      continue
    }

    if (!resolvedPackage) {
      continue
    }

    if (visitedPackages.has(resolvedPackage.name)) {
      continue
    }

    visitedPackages.add(resolvedPackage.name)
    requiredPackageNames.add(resolvedPackage.name)

    const dependencyEntries = [
      ...Object.keys(resolvedPackage.packageJson.dependencies ?? {}).map((packageName) => ({
        isOptional: false,
        packageName
      })),
      ...Object.keys(resolvedPackage.packageJson.optionalDependencies ?? {}).map((packageName) => ({
        isOptional: true,
        packageName
      }))
    ]

    for (const dependency of dependencyEntries) {
      queue.push({
        fromPackageRoot: resolvedPackage.packageRoot,
        isOptional: dependency.isOptional,
        isRoot: false,
        packageName: dependency.packageName
      })
    }
  }

  if (unresolvedTransitivePackages.length > 0) {
    const verboseFlagEnabled = process.env.VERIFY_RUNTIME_DEPS_VERBOSE === '1'
    console.warn(
      `Skipped ${unresolvedTransitivePackages.length} unresolved transitive runtime dependencies while building the verification graph.`
    )

    if (verboseFlagEnabled) {
      for (const missingPackage of unresolvedTransitivePackages) {
        console.warn(`- ${missingPackage.packageName} (from ${missingPackage.fromPackageRoot})`)
        console.warn(`  ${missingPackage.message}`)
      }
    } else {
      console.warn(
        'Set VERIFY_RUNTIME_DEPS_VERBOSE=1 to print the unresolved dependency details.'
      )
    }
  }

  return [...requiredPackageNames]
    .sort()
    .map((packageName) => `/node_modules/${packageName}/package.json`)
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

  const requiredPackagePaths = collectRequiredPackagePaths()
  const asarPaths = resolveAsarPaths(inputPath).filter((asarPath) => existsSync(asarPath))
  if (asarPaths.length === 0) {
    console.error(`Packaged app archive not found for ${resolve(inputPath)}`)
    process.exit(1)
  }

  let hasMissingEntries = false

  for (const asarPath of asarPaths) {
    const entries = new Set(listPackage(asarPath).map(normalizeArchiveEntryPath))
    const missing = requiredPackagePaths.filter(
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
