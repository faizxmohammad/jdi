import type { Express } from "express"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"

/** Bind Express on an ephemeral loopback port and wait until listening. */
export const listenLoopback = async (
  app: Express,
): Promise<{ server: Server; baseUrl: string }> => {
  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1")
    s.once("listening", () => resolve(s))
    s.once("error", reject)
  })
  const address = server.address() as AddressInfo | null
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("failed to bind loopback test server")
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

export const closeServer = (server: Server | undefined): Promise<void> => {
  if (!server) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
