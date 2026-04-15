import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "get-game-info",
    {
      title: "Get information about the current Roblox game",
      description:
        "Retrieves basic information about the current game including PlaceId, GameId, PlaceVersion, and other metadata.",
      inputSchema: z.object({}),
    },
    async () =>
      sendAndWait({
        type: "get-game-info",
        data: {},
        failureMessage: () => "Failed to get game info.",
      })
  );
}
