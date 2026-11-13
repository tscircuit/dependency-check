import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  checkDependencies,
  defaultOptions,
  resolvePeerDepsShouldBeAsterisk,
} from "./dependency-check"

function withTempWorkspace(
  files: Record<string, string>,
  fn: (dir: string) => void,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dep-check-test-"))
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content, "utf-8")
    }
    fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test("rejects non-asterisk internal peerDependencies in package.json by default", () => {
  withTempWorkspace(
    {
      "package.json": JSON.stringify({
        name: "@tscircuit/core",
        peerDependencies: {
          "@tscircuit/props": "^0.0.183",
          "circuit-json": "*",
        },
      }),
    },
    (dir) => {
      const res = checkDependencies(path.join(dir, "package.json"))
      expect(res.success).toBe(false)
      expect(res.errors).toContain(
        'Internal module "@tscircuit/props" in peerDependencies should use "*" as version.',
      )
    },
  )
})

test("rejects non-asterisk internal peerDependencies in bun.lock even when package.json uses *", () => {
  withTempWorkspace(
    {
      "package.json": JSON.stringify({
        name: "@tscircuit/core",
        peerDependencies: {
          "@tscircuit/props": "*",
          "circuit-json": "*",
        },
      }),
      "bun.lock": `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "@tscircuit/core",
      "peerDependencies": {
        "@tscircuit/props": "^0.0.183",
        "circuit-json": "*",
      },
    },
  },
  "packages": {}
}`,
    },
    (dir) => {
      const res = checkDependencies(path.join(dir, "package.json"))
      expect(res.success).toBe(false)
      expect(res.errors).toContain(
        'Internal module "@tscircuit/props" in bun.lock peerDependencies should use "*" as version.',
      )
    },
  )
})

test("passes when both package.json and bun.lock use * for internal peerDependencies", () => {
  withTempWorkspace(
    {
      "package.json": JSON.stringify({
        name: "@tscircuit/core",
        peerDependencies: {
          "@tscircuit/props": "*",
          "circuit-json": "*",
          typescript: "^5.0.0",
        },
      }),
      "bun.lock": `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "@tscircuit/core",
      "peerDependencies": {
        "@tscircuit/props": "*",
        "circuit-json": "*",
        "typescript": "^5.0.0",
      },
    },
  },
  "packages": {}
}`,
    },
    (dir) => {
      const res = checkDependencies(path.join(dir, "package.json"))
      expect(res.success).toBe(true)
      expect(res.errors).toHaveLength(0)
    },
  )
})

test("resolvePeerDepsShouldBeAsterisk defaults to true and respects explicit false", () => {
  expect(defaultOptions.peer_deps_should_be_asterisk).toBe(true)
  expect(resolvePeerDepsShouldBeAsterisk(undefined)).toBe(true)
  expect(resolvePeerDepsShouldBeAsterisk("")).toBe(true)
  expect(resolvePeerDepsShouldBeAsterisk("true")).toBe(true)
  expect(resolvePeerDepsShouldBeAsterisk("false")).toBe(false)
  expect(resolvePeerDepsShouldBeAsterisk("FALSE")).toBe(false)
})
