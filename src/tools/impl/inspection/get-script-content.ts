import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "get-script-content",
    {
      title: "Get the content of a script in the Roblox Game Client",
      description: "Get the content of a script in the Roblox Game Client",
      inputSchema: z.object({
        scriptGetterSource: z
          .string()
          .describe(
            "The code that fetches the script object from the game (should return a script object, and MUST be client-side only, will not work on Scripts with RunContext set to Server)"
          )
          .optional(),
        scriptPath: z
          .string()
          .describe(
            "The path to the script to get the content of. If passing a GC'd script proxy (e.g. <ScriptProxy: 1_316566>), use the literal angle brackets < > — do NOT HTML-encode them as &lt; or &gt;."
          )
          .optional(),
        startLine: z
          .number()
          .describe(
            "Optional start line number (1-based) to return only a range of lines from the decompiled script. If omitted, returns the full script."
          )
          .optional(),
        endLine: z
          .number()
          .describe(
            "Optional end line number (1-based, inclusive) to return only a range of lines. Defaults to end of script if startLine is set but endLine is omitted."
          )
          .optional(),
      }),
    },
    async ({ scriptGetterSource, scriptPath, startLine, endLine }) => {
      if (scriptGetterSource === undefined && scriptPath === undefined) {
        return {
          content: [
            { type: "text" as const, text: "Must provide either scriptGetterSource or scriptPath." },
          ],
        };
      } else if (scriptGetterSource !== undefined && scriptPath !== undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Must provide either scriptGetterSource or scriptPath, not both.",
            },
          ],
        };
      }

      const scriptProxyMatch = (scriptPath ?? scriptGetterSource ?? "").match(
        /^<ScriptProxy: (.+)>$/
      );

      const data = scriptProxyMatch
        ? { debugId: scriptProxyMatch[1], startLine, endLine }
        : {
            source:
              scriptGetterSource === undefined ? `return ${scriptPath}` : scriptGetterSource,
            startLine,
            endLine,
          };

      return sendAndWait({
        type: "get-script-content",
        data,
        failureMessage: () => "Failed to get script content.",
      });
    }
  );
}
