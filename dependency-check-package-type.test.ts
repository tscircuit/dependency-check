import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(
  new URL("./dependency-check.ts", import.meta.url),
)

function runCheck(
  packageType: string | undefined,
  packageJson: Record<string, unknown>,
) {
  const workspace = mkdtempSync(path.join(tmpdir(), "dependency-check-type-"))
  try {
    writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify(packageJson),
    )
    const env = {
      ...process.env,
      GITHUB_WORKSPACE: workspace,
      INPUT_PACKAGE_TYPE: packageType,
      INPUT_PEER_DEPS_SHOULD_BE_ASTERISK: "true",
      INPUT_ADDITIONAL_INTERNAL_MODULES: "",
      INPUT_IGNORE_PACKAGES: "",
    }
    if (packageType === undefined) delete env.INPUT_PACKAGE_TYPE
    const result = spawnSync(process.execPath, [scriptPath], {
      env,
      encoding: "utf8",
      timeout: 10_000,
    })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    return result
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

for (const packageType of [
  "internal-lib",
  "INTERNAL_LIB",
  " ",
  "bundled_lib ",
  "constructor",
]) {
  test(`rejects package_type ${JSON.stringify(packageType)}`, () => {
    const result = runCheck(packageType, {
      dependencies: { "@tscircuit/core": "1.0.0" },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Invalid package_type/)
    assert.match(result.stderr, /internal_lib/)
    assert.match(result.stderr, /bundled_lib/)
    assert.doesNotMatch(result.stdout, /All dependency checks passed/)
  })
}

test("rejects an invalid mode without dependencies", () => {
  const result = runCheck("invalid", {})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid package_type/)
})

for (const packageType of [undefined, "", "internal_lib"]) {
  test(`checks internal mode ${JSON.stringify(packageType) ?? "unset"}`, () => {
    const result = runCheck(packageType, {
      dependencies: { "@tscircuit/core": "1.0.0" },
    })
    assert.equal(result.status, 1)
    assert.match(
      result.stderr,
      /It should be in peerDependencies or devDependencies/,
    )
  })
}

test("bundled_lib still rejects internal peer dependencies", () => {
  const result = runCheck("bundled_lib", {
    peerDependencies: { "@tscircuit/core": "*" },
  })
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /Bundled libs cannot have internal peer dependencies/,
  )
})

test("internal_lib still accepts internal wildcard peer dependencies", () => {
  const result = runCheck("internal_lib", {
    peerDependencies: { "@tscircuit/core": "*" },
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /All dependency checks passed/)
})

test("bundled_lib still accepts external dependencies", () => {
  const result = runCheck("bundled_lib", { dependencies: { react: "19.0.0" } })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /All dependency checks passed/)
})
