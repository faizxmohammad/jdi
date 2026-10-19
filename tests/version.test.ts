import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { SERVER_VERSION } from "../src/version.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

describe("SERVER_VERSION", () => {
  it("matches package.json version", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      version: string
    }
    expect(SERVER_VERSION).toBe(pkg.version)
  })
})
