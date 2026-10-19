import { assertDeploymentModeAllowed, config } from "./config.js"
import { createApp } from "./app.js"

assertDeploymentModeAllowed()

const app = createApp()

const httpServer = app.listen(config.PORT, config.HOST, () => {
  console.info(`Just Do It listening on ${config.HOST}:${config.PORT}`)
})

const shutdown = (signal: string): void => {
  console.info(`Received ${signal}; shutting down`)
  httpServer.close((error) => {
    if (error) {
      console.error("HTTP server shutdown failed", error)
      process.exitCode = 1
    }
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
