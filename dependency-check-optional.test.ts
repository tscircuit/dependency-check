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
  packageType: "internal_lib" | "bundled_lib",
  packageJson: Record<string, unknown>,
  inputs: Record<string, string> = {},
) {
  const workspace = mkdtempSync(path.join(tmpdir(), "dependency-optional-"))
  try {
    writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify(packageJson),
    )
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: workspace,
      env: {
        ...process.env,
        GITHUB_WORKSPACE: workspace,
        INPUT_PACKAGE_TYPE: packageType,
        INPUT_PEER_DEPS_SHOULD_BE_ASTERISK: "true",
        INPUT_ADDITIONAL_INTERNAL_MODULES: "",
        INPUT_IGNORE_PACKAGES: "",
        ...inputs,
      },
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

for (const packageType of ["internal_lib", "bundled_lib"] as const) {
  for (const dependency of ["@tscircuit/core", "schematic-symbols"]) {
    test(`${packageType} rejects optional internal ${dependency}`, () => {
      const result = runCheck(packageType, {
        optionalDependencies: { [dependency]: "1.0.0" },
      })
      assert.equal(result.status, 1)
      assert.match(result.stderr, /found in optionalDependencies/)
      assert.ok(result.stderr.includes(dependency))
      assert.doesNotMatch(result.stdout, /All dependency checks passed/)
    })
  }

  test(`${packageType} rejects an additional optional internal module`, () => {
    const result = runCheck(
      packageType,
      { optionalDependencies: { "local-helper": "1.0.0" } },
      { INPUT_ADDITIONAL_INTERNAL_MODULES: "other-module, local-helper" },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /local-helper.*found in optionalDependencies/)
  })

  test(`${packageType} retains the ignore exception for optional modules`, () => {
    const result = runCheck(
      packageType,
      { optionalDependencies: { "@tscircuit/core": "1.0.0" } },
      { INPUT_IGNORE_PACKAGES: "other-module, @tscircuit/core" },
    )
    assert.equal(result.status, 0)
    assert.match(result.stdout, /All dependency checks passed/)
  })

  test(`${packageType} allows external optional and internal dev modules`, () => {
    const result = runCheck(packageType, {
      optionalDependencies: { react: "19.0.0" },
      devDependencies: { "@tscircuit/core": "1.0.0" },
    })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /All dependency checks passed/)
  })

  test(`${packageType} preserves the regular internal dependency error`, () => {
    const result = runCheck(packageType, {
      dependencies: { "@tscircuit/core": "1.0.0" },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /found in dependencies\./)
  })

  test(`${packageType} reports overlapping optional entries once`, () => {
    const result = runCheck(packageType, {
      dependencies: { "@tscircuit/core": "1.0.0" },
      optionalDependencies: { "@tscircuit/core": "2.0.0" },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /found in optionalDependencies/)
    assert.equal(
      result.stderr.split('Internal module "@tscircuit/core"').length,
      2,
    )
  })

  test(`${packageType} preserves rejection of a null dependencies map`, () => {
    const result = runCheck(packageType, { dependencies: null })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Error reading or parsing package.json/)
  })
}

test("internal_lib still allows wildcard internal peers", () => {
  const result = runCheck("internal_lib", {
    optionalDependencies: { react: "19.0.0" },
    peerDependencies: { "@tscircuit/core": "*" },
  })
  assert.equal(result.status, 0)
})

test("internal_lib still rejects versioned internal peers", () => {
  const result = runCheck("internal_lib", {
    peerDependencies: { "@tscircuit/core": "1.0.0" },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /peerDependencies should use "\*"/)
})

test("bundled_lib still rejects internal peers", () => {
  const result = runCheck("bundled_lib", {
    optionalDependencies: { react: "19.0.0" },
    peerDependencies: { "@tscircuit/core": "*" },
  })
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /Bundled libs cannot have internal peer dependencies/,
  )
})
