import { expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const scriptPath = path.join(import.meta.dir, "dependency-check.ts")

const runCheck = (
  input: string | undefined,
  packageJson: Record<string, unknown> = {
    peerDependencies: { "@tscircuit/core": "^0.0.1348" },
  },
  packageType = "internal_lib",
) => {
  const workspace = mkdtempSync(path.join(tmpdir(), "dependency-check-input-"))
  try {
    writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify(packageJson),
    )
    const env = {
      ...process.env,
      GITHUB_WORKSPACE: workspace,
      INPUT_PACKAGE_TYPE: packageType,
      INPUT_PEER_DEPS_SHOULD_BE_ASTERISK: input,
      INPUT_ADDITIONAL_INTERNAL_MODULES: "",
      INPUT_IGNORE_PACKAGES: "",
    }
    if (input === undefined) delete env.INPUT_PEER_DEPS_SHOULD_BE_ASTERISK
    const result = Bun.spawnSync([process.execPath, scriptPath], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

test("explicit false allows a versioned internal peer dependency", () => {
  const result = runCheck("false")
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain('"peer_deps_should_be_asterisk": false')
  expect(result.stdout).toContain("All dependency checks passed!")
})

for (const input of ["true", undefined, ""] as const) {
  test(`asterisk requirement remains enabled for ${JSON.stringify(input) ?? "unset"} input`, () => {
    const result = runCheck(input)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('"peer_deps_should_be_asterisk": true')
    expect(result.stderr).toContain(
      'peerDependencies should use "*" as version.',
    )
  })
}

test("explicit false still rejects an internal regular dependency", () => {
  const result = runCheck("false", {
    dependencies: { "@tscircuit/core": "^0.0.1348" },
  })
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain(
    "It should be in peerDependencies or devDependencies.",
  )
})

test("explicit false still rejects an internal bundled-library peer dependency", () => {
  const result = runCheck(
    "false",
    { peerDependencies: { "@tscircuit/core": "^0.0.1348" } },
    "bundled_lib",
  )
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain(
    "Bundled libs cannot have internal peer dependencies.",
  )
})
