import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "clear-remote-spy-logs",
    {
      title: "Clear all remote spy logs",
      description:
        "Clears all captured remote spy logs from Cobalt. This removes all logged calls for every remote. Cobalt must be loaded first via ensure-remote-spy.",
      inputSchema: z.object({}),
    },
    async () =>
      sendAndWait({
        type: "clear-remote-spy-logs",
        data: {},
        failureMessage: (response) =>
          "Failed to clear remote spy logs. Response: " + JSON.stringify(response),
      })
  );
}
