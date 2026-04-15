import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "crypto";
import { WebSocket } from "ws";
import {
  getInstanceRole,
  getRelaySocket,
  GetResponseOfIdFromClient,
} from "../../../bridge/handlers/shared/communication.js";
import { formatActiveClientListForTool } from "../../../bridge/handlers/shared/registry.js";
import { NO_CLIENT_ERROR } from "../../errors.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "list-clients",
    {
      title: "List connected Roblox clients",
      description:
        "Returns a list of all Roblox game clients currently connected to the MCP bridge, including their clientId, username, placeId, jobId, and placeName. Use the clientId from this list to target specific clients in other tools.",
    },
    async () => {
      if (getInstanceRole() === "secondary") {
        const id = crypto.randomUUID();
        const socket = getRelaySocket();
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ id, type: "list-clients" }));
          const response = await GetResponseOfIdFromClient(id);
          return {
            content: [
              {
                type: "text" as const,
                text: response?.output ?? response?.error ?? "Failed to list clients.",
              },
            ],
          };
        }
        return NO_CLIENT_ERROR;
      }

      return {
        content: [{ type: "text" as const, text: formatActiveClientListForTool() }],
      };
    }
  );
}
