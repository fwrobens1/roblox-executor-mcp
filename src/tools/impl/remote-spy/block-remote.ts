import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "block-remote",
    {
      title: "Block or unblock a remote",
      description:
        "Block or unblock a specific remote event/function in the Cobalt remote spy. Blocked remotes will have their calls prevented from reaching the server/client. Cobalt must be loaded first via ensure-remote-spy.",
      inputSchema: z.object({
        remoteName: z.string().describe("The exact name of the remote to block/unblock"),
        direction: z
          .enum(["Incoming", "Outgoing"])
          .describe("Whether the remote is Incoming or Outgoing"),
        shouldBlock: z
          .boolean()
          .describe("true to block, false to unblock")
          .optional()
          .default(true),
      }),
    },
    async ({ remoteName, direction, shouldBlock }) =>
      sendAndWait({
        type: "block-remote",
        data: { remoteName, direction, shouldBlock },
        failureMessage: (response) =>
          "Failed to block/unblock remote. Response: " + JSON.stringify(response),
      })
  );
}
