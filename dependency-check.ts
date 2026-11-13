#!/usr/bin/env bun

import fs from "node:fs"
import path from "node:path"

// List of internal packages that should be treated as internal modules
const INTERNAL_PACKAGE_LIST: string[] = [
  "schematic-symbols",
  // Add your internal packages here
  // Example: "@tscircuit/core",
  // Example: "@tscircuit/schematic",
]

export interface CheckOptions {
  package_type: "internal_lib" | "bundled_lib"
  peer_deps_should_be_asterisk: boolean
  additional_internal_modules?: string[]
  ignore_packages?: string[]
}

// Default options
export const defaultOptions: CheckOptions = {
  package_type: "internal_lib",
  peer_deps_should_be_asterisk: true,
  additional_internal_modules: [],
  ignore_packages: [],
}

/**
 * Checks if a package is considered an internal module
 */
export function isInternalModule(
  packageName: string,
  additionalModules: string[] = [],
): boolean {
  // Check if it's in the INTERNAL_PACKAGE_LIST
  if (INTERNAL_PACKAGE_LIST.includes(packageName)) {
    return true
  }

  // Check if it has the @tscircuit/ prefix
  if (packageName.startsWith("@tscircuit/")) {
    return true
  }

  // Check if it has "circuit" in the name
  if (packageName.toLowerCase().includes("circuit")) {
    return true
  }

  // Check if it's in the additional modules list
  if (additionalModules.includes(packageName)) {
    return true
  }

  return false
}

function parseJsonWithTrailingCommas(content: string): any {
  const sanitized = content.replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(sanitized)
}

function checkLockfilePeerDependencies(
  bunLockPath: string,
  options: CheckOptions,
  errors: string[],
): boolean {
  if (!fs.existsSync(bunLockPath)) {
    return true
  }

  let success = true
  try {
    const bunLockContent = fs.readFileSync(bunLockPath, "utf-8")
    const bunLock = parseJsonWithTrailingCommas(bunLockContent)
    const rootWorkspace = bunLock?.workspaces?.[""]
    if (!rootWorkspace) {
      return true
    }

    const {
      dependencies = {},
      peerDependencies = {},
    }: {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    } = rootWorkspace

    if (options.package_type === "internal_lib") {
      for (const [dep] of Object.entries(dependencies)) {
        if (
          isInternalModule(dep, options.additional_internal_modules) &&
          !options.ignore_packages?.includes(dep)
        ) {
          success = false
          errors.push(
            `Internal module "${dep}" found in bun.lock dependencies. It should be in peerDependencies or devDependencies.`,
          )
        }
      }

      if (options.peer_deps_should_be_asterisk) {
        for (const [dep, version] of Object.entries(peerDependencies)) {
          if (
            isInternalModule(dep, options.additional_internal_modules) &&
            version !== "*" &&
            !options.ignore_packages?.includes(dep)
          ) {
            success = false
            errors.push(
              `Internal module "${dep}" in bun.lock peerDependencies should use "*" as version.`,
            )
          }
        }
      }
    } else if (options.package_type === "bundled_lib") {
      for (const [dep] of Object.entries(dependencies)) {
        if (
          isInternalModule(dep, options.additional_internal_modules) &&
          !options.ignore_packages?.includes(dep)
        ) {
          success = false
          errors.push(
            `Internal module "${dep}" found in bun.lock dependencies. Bundled libs cannot have internal dependencies.`,
          )
        }
      }

      for (const [dep] of Object.entries(peerDependencies)) {
        if (
          isInternalModule(dep, options.additional_internal_modules) &&
          !options.ignore_packages?.includes(dep)
        ) {
          success = false
          errors.push(
            `Internal module "${dep}" found in bun.lock peerDependencies. Bundled libs cannot have internal peer dependencies.`,
          )
        }
      }
    }
  } catch (error: any) {
    success = false
    errors.push(`Error reading or parsing bun.lock: ${error.message}`)
  }

  return success
}

/**
 * Check package.json (and adjacent bun.lock) dependencies against the rules
 */
export function checkDependencies(
  packageJsonPath: string,
  options: CheckOptions = defaultOptions,
): { success: boolean; errors: string[] } {
  const result = { success: true, errors: [] as string[] }

  try {
    // Read package.json
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8")
    const packageJson = JSON.parse(packageJsonContent)

    // Get dependencies sections
    const {
      dependencies = {},
      peerDependencies = {},
      devDependencies = {},
    } = packageJson

    // Check based on package_type
    if (options.package_type === "internal_lib") {
      // Check regular dependencies for internal packages
      for (const [dep] of Object.entries(dependencies)) {
        if (
          isInternalModule(dep, options.additional_internal_modules) &&
          !options.ignore_packages?.includes(dep)
        ) {
          result.success = false
          result.errors.push(
            `Internal module "${dep}" found in dependencies. It should be in peerDependencies or devDependencies.`,
          )
        }
      }

      // Check peer dependencies version format if required
      if (options.peer_deps_should_be_asterisk) {
        for (const [dep, version] of Object.entries(peerDependencies)) {
          if (
            isInternalModule(dep, options.additional_internal_modules) &&
            version !== "*" &&
            !options.ignore_packages?.includes(dep)
          ) {
            result.success = false
            result.errors.push(
              `Internal module "${dep}" in peerDependencies should use "*" as version.`,
            )
          }
        }
      }
    } else if (options.package_type === "bundled_lib") {
      // For bundled_lib, no internal package should be in dependencies or peerDependencies
      for (const [dep] of Object.entries(dependencies)) {
        if (
          isInternalModule(dep, options.additional_internal_modules) &&
          !options.ignore_packages?.includes(dep)
        ) {
          result.success = false
          result.errors.push(
            `Internal module "${dep}" found in dependencies. Bundled libs cannot have internal dependencies.`,
          )
        }
      }

      for (const [dep] of Object.entries(peerDependencies)) {
        if (
          isInternalModule(dep, options.additional_internal_modules) &&
          !options.ignore_packages?.includes(dep)
        ) {
          result.success = false
          result.errors.push(
            `Internal module "${dep}" found in peerDependencies. Bundled libs cannot have internal peer dependencies.`,
          )
        }
      }
    }

    const bunLockPath = path.join(path.dirname(packageJsonPath), "bun.lock")
    if (!checkLockfilePeerDependencies(bunLockPath, options, result.errors)) {
      result.success = false
    }
  } catch (error: any) {
    result.success = false
    result.errors.push(
      `Error reading or parsing package.json: ${error.message}`,
    )
  }

  return result
}

export function resolvePeerDepsShouldBeAsterisk(
  envValue: string | undefined,
  defaultValue: boolean = defaultOptions.peer_deps_should_be_asterisk,
): boolean {
  if (envValue === undefined || envValue.trim() === "") {
    return defaultValue
  }
  const normalized = envValue.trim().toLowerCase()
  if (normalized === "false" || normalized === "0") {
    return false
  }
  if (normalized === "true" || normalized === "1") {
    return true
  }
  return defaultValue
}

// Main function
async function main() {
  try {
    // Find the GitHub Action inputs if running as an action
    const packageType =
      process.env.INPUT_PACKAGE_TYPE || defaultOptions.package_type
    const peerDepsAsterisk = resolvePeerDepsShouldBeAsterisk(
      process.env.INPUT_PEER_DEPS_SHOULD_BE_ASTERISK,
    )
    const additionalInternalModulesStr =
      process.env.INPUT_ADDITIONAL_INTERNAL_MODULES ||
      process.env.INPUT_ADDITIONAL_INTERNAL_PACKAGES ||
      ""
    const additionalInternalModules = additionalInternalModulesStr
      ? additionalInternalModulesStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const ignorePackagesStr = process.env.INPUT_IGNORE_PACKAGES || ""
    const ignorePackages = ignorePackagesStr
      ? ignorePackagesStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    const options: CheckOptions = {
      package_type: packageType as "internal_lib" | "bundled_lib",
      peer_deps_should_be_asterisk: peerDepsAsterisk,
      additional_internal_modules: additionalInternalModules,
      ignore_packages: ignorePackages,
    }

    // Get the workspace directory
    const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd()
    const packageJsonPath = path.join(workspaceDir, "package.json")

    console.log(
      "Checking dependencies with options:",
      JSON.stringify(options, null, 2),
    )

    const result = checkDependencies(packageJsonPath, options)

    if (!result.success) {
      console.error("❌ Dependency check failed:")
      // biome-ignore lint/complexity/noForEach: <explanation>
      result.errors.forEach((error) => console.error(`  - ${error}`))
      process.exit(1)
    } else {
      console.log("✅ All dependency checks passed!")
    }
  } catch (error: any) {
    console.error("❌ An error occurred:", error.message)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
