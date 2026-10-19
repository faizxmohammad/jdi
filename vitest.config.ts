import { defineConfig } from "vitest/config"

process.env.NODE_ENV ??= "test"
process.env.JUST_DO_IT_TOKEN ??= "test-token-xxxxxxxxxxxxxxxxxxxxxxxx"
process.env.JUST_DO_IT_OWNER_ID ??= "owner-a"
process.env.JUST_DO_IT_DEPLOYMENT_MODE ??= "local"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
})
