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
  manifest: Record<string, unknown>,
  inputs: Record<string, string> = {},
) {
  const workspace = mkdtempSync(path.join(tmpdir(), "dependency-alias-"))
  try {
    writeFileSync(path.join(workspace, "package.json"), JSON.stringify(manifest))
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

function expectRejected(result: ReturnType<typeof runCheck>, section: string) {
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /Internal module "helper"/)
  assert.ok(result.stderr.includes(section), result.stderr)
  assert.doesNotMatch(result.stdout, /All dependency checks passed/)
}

function expectAccepted(result: ReturnType<typeof runCheck>) {
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /All dependency checks passed/)
}

for (const mode of ["internal_lib", "bundled_lib"] as const) {
  for (const spec of [
    "npm:@tscircuit/core@^0.0.1348",
    "npm:@tscircuit/core",
    "npm:schematic-symbols@latest",
    "npm:other-circuit-lib@1.0.0",
    "NPM:@tscircuit/core@*",
    "npm:@tscircuit/core@^1.0.0\n||^2.0.0",
  ]) {
    test(`${mode} rejects a dependency alias for ${spec}`, () => {
      expectRejected(
        runCheck(mode, { dependencies: { helper: spec } }),
        "dependencies",
      )
    })
  }

  test(`${mode} honors additional internal modules for alias targets`, () => {
    expectRejected(
      runCheck(
        mode,
        { dependencies: { helper: "npm:private-helper@1.0.0" } },
        { INPUT_ADDITIONAL_INTERNAL_MODULES: "other, private-helper" },
      ),
      "dependencies",
    )
  })

  for (const spec of ["npm:react@19", "npm:@external/helper", "^1.0.0"]) {
    test(`${mode} allows an external dependency ${spec}`, () => {
      expectAccepted(runCheck(mode, { dependencies: { helper: spec } }))
    })
  }

  test(`${mode} keeps ignore_packages keyed by the declared alias`, () => {
    expectAccepted(
      runCheck(
        mode,
        { dependencies: { helper: "npm:@tscircuit/core@1.0.0" } },
        { INPUT_IGNORE_PACKAGES: "other, helper" },
      ),
    )
  })

  test(`${mode} does not broaden an ignore entry to a different alias`, () => {
    expectRejected(
      runCheck(
        mode,
        { dependencies: { helper: "npm:@tscircuit/core@1.0.0" } },
        { INPUT_IGNORE_PACKAGES: "@tscircuit/core" },
      ),
      "dependencies",
    )
  })

  test(`${mode} retains classification of the declared dependency key`, () => {
    const result = runCheck(mode, {
      dependencies: { "@tscircuit/core": "npm:react@19" },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Internal module "@tscircuit\/core"/)
  })

  test(`${mode} preserves direct internal dependency rejection`, () => {
    const result = runCheck(mode, {
      dependencies: { "@tscircuit/core": "1.0.0" },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /found in dependencies/)
  })

  test(`${mode} permits internal aliases in devDependencies`, () => {
    expectAccepted(
      runCheck(mode, {
        devDependencies: { helper: "npm:@tscircuit/core@1.0.0" },
      }),
    )
  })
}

for (const spec of [
  "npm:@tscircuit/core@1.0.0",
  "npm:schematic-symbols@^1.0.0",
]) {
  test(`internal_lib requires a wildcard for the internal peer alias ${spec}`, () => {
    expectRejected(
      runCheck("internal_lib", { peerDependencies: { helper: spec } }),
      'should use "*"',
    )
  })
}

for (const spec of [
  "npm:@tscircuit/core@*",
  "npm:@tscircuit/core",
  "npm:schematic-symbols@",
  "npm:@tscircuit/core@ * ",
]) {
  test(`internal_lib preserves the literal wildcard rule for peer alias ${spec}`, () => {
    expectRejected(
      runCheck("internal_lib", { peerDependencies: { helper: spec } }),
      'should use "*"',
    )
  })
  test(`bundled_lib rejects internal peer alias ${spec}`, () => {
    expectRejected(
      runCheck("bundled_lib", { peerDependencies: { helper: spec } }),
      "peerDependencies",
    )
  })
}

for (const mode of ["internal_lib", "bundled_lib"] as const) {
  test(`${mode} allows external peer aliases`, () => {
    expectAccepted(
      runCheck(mode, { peerDependencies: { helper: "npm:react@19" } }),
    )
  })
  test(`${mode} honors ignored internal peer aliases`, () => {
    expectAccepted(
      runCheck(
        mode,
        { peerDependencies: { helper: "npm:@tscircuit/core@1.0.0" } },
        { INPUT_IGNORE_PACKAGES: "helper" },
      ),
    )
  })
  test(`${mode} applies additional internal module names to peer aliases`, () => {
    expectRejected(
      runCheck(
        mode,
        { peerDependencies: { helper: "npm:private-helper@1.0.0" } },
        { INPUT_ADDITIONAL_INTERNAL_MODULES: "private-helper" },
      ),
      "peerDependencies",
    )
  })
}

test("internal_lib continues to allow a direct wildcard internal peer", () => {
  expectAccepted(
    runCheck("internal_lib", { peerDependencies: { "@tscircuit/core": "*" } }),
  )
})

for (const spec of ["npm:@tscircuit/core@*", "npm:react@*"]) {
  test(`internal_lib preserves rejection of a nonliteral version on an internal key: ${spec}`, () => {
    const result = runCheck("internal_lib", {
      peerDependencies: { "@tscircuit/core": spec },
    })
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, /Internal module "@tscircuit\/core"/)
    assert.match(result.stderr, /peerDependencies should use "\*"/)
    assert.doesNotMatch(result.stdout, /All dependency checks passed/)
  })
}

test("non-alias URLs are not interpreted as registry alias targets", () => {
  expectAccepted(
    runCheck("internal_lib", {
      dependencies: { helper: "https://example.invalid/tscircuit/core.tgz" },
    }),
  )
})

test("a leading-space directory spec is not interpreted as an npm alias", () => {
  expectAccepted(
    runCheck("internal_lib", {
      dependencies: { helper: " npm:@tscircuit/core@* " },
    }),
  )
})
