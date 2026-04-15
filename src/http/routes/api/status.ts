import type { IncomingMessage, ServerResponse } from "http";
import { relayClients } from "../../../bridge/handlers/shared/communication.js";
import { getActiveClients } from "../../../bridge/handlers/shared/registry.js";

export function GET(_req: IncomingMessage, res: ServerResponse): void {
  const active = getActiveClients();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      connected: active.length > 0,
      clientCount: active.length,
      role: "Primary",
      relayClients: relayClients.size,
      clients: active.map((c) => ({
        clientId: c.clientId,
        username: c.username,
        userId: c.userId,
        placeId: c.placeId,
        jobId: c.jobId,
        placeName: c.placeName,
        transport: c.transport,
      })),
    })
  );
}
