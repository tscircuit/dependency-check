import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { checkDependencies, isInternalModule } from "./dependency-check"

function checkPackageJson(packageJson: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "dependency-check-"))
  const packageJsonPath = path.join(dir, "package.json")

  try {
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    return checkDependencies(packageJsonPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("dependency-check", () => {
  test("allows the public tscircuit package as an app dependency", () => {
    expect(isInternalModule("tscircuit")).toBe(false)

    const result = checkPackageJson({
      dependencies: {
        tscircuit: "^0.0.1926",
      },
    })

    expect(result.success).toBe(true)
  })

  test("forbids installing tscircuit bundled internal packages alongside tscircuit", () => {
    const result = checkPackageJson({
      dependencies: {
        tscircuit: "^0.0.1926",
        "@tscircuit/core": "^0.0.1348",
        "schematic-symbols": "^0.0.226",
      },
    })

    expect(result.success).toBe(false)
    expect(result.errors).toEqual([
      expect.stringContaining('Internal module "@tscircuit/core"'),
      expect.stringContaining('Internal module "schematic-symbols"'),
    ])
    expect(result.errors.join("\n")).toContain(
      '"tscircuit" package already includes internal dependencies',
    )
  })

  test('requires "*" for internal peer dependency versions', () => {
    const result = checkPackageJson({
      peerDependencies: {
        "@tscircuit/core": "^0.0.1348",
      },
    })

    expect(result.success).toBe(false)
    expect(result.errors).toEqual([
      'Internal module "@tscircuit/core" in peerDependencies should use "*" as version.',
    ])
  })
})
