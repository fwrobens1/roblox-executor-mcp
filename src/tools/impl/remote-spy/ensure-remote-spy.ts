import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "ensure-remote-spy",
    {
      title: "Ensure the Cobalt remote spy is loaded",
      description:
        "Loads the Cobalt remote spy if it is not already running. Cobalt hooks all RemoteEvents, RemoteFunctions, BindableEvents, BindableFunctions (both incoming and outgoing, including Actors) and logs their calls. Must be called before using get-remote-spy-logs. Returns the current status of Cobalt.",
      inputSchema: z.object({}),
    },
    async () =>
      sendAndWait({
        type: "ensure-remote-spy",
        data: {},
        failureMessage: (response) =>
          "Failed to ensure remote spy. Response: " + JSON.stringify(response),
      })
  );
}
