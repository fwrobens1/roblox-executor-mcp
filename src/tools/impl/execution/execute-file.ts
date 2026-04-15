import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import { z } from "zod";
import { sendFireAndForget } from "../../factory.js";
import { threadContextSchema } from "../../schemas.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "execute-file",
    {
      title: "Execute a Luau file in the Roblox Game Client",
      description:
        "Reads a local .luau or .lua file from disk and executes its contents in the Roblox Game Client. This tool does NOT return output - use get-data-by-code if you need to retrieve data.",
      inputSchema: z.object({
        filePath: z
          .string()
          .describe("The absolute path to the .luau or .lua file to execute"),
        threadContext: threadContextSchema,
      }),
    },
    async ({ filePath, threadContext }) => {
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text" as const, text: `File not found: ${filePath}` }],
        };
      }

      const code = fs.readFileSync(filePath, "utf-8");
      console.error(`Executing file ${filePath} in thread ${threadContext}...`);

      return sendFireAndForget({
        type: "execute",
        data: { source: `setthreadidentity(${threadContext})\n${code}` },
        successMessage: `File executed: ${filePath} (thread context ${threadContext})`,
      });
    }
  );
}
