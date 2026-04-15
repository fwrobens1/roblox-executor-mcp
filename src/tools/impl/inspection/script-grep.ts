import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "script-grep",
    {
      title: "Grep across all scripts in the game",
      description:
        'Search across all decompiled scripts in the game using standard regex syntax (Perl/PCRE2). Supports patterns like \\bRemoteEvent\\b, \\w+Service, function\\s+\\w+, lookaheads, alternation (foo|bar), etc. Use the literal flag for plain string matching. IMPORTANT: If a script instance has already been garbage collected, a "<ScriptProxy: DebugId>" string will be returned instead of the script instance path.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search pattern. Supports standard regex syntax (Perl/PCRE2): \\d, \\w, \\s, \\b, character classes [a-z], alternation (foo|bar), quantifiers (+, *, ?), groups, lookaheads, etc. Use the literal flag for exact string matching."
          ),
        limit: z
          .number()
          .describe("Maximum number of scripts to return results from (default: 50)")
          .optional()
          .default(50),
        contextLines: z
          .number()
          .describe("Number of lines of context to show before and after each match (default: 2)")
          .optional()
          .default(2),
        maxMatchesPerScript: z
          .number()
          .describe("Maximum number of matches to return per script (default: 20)")
          .optional()
          .default(20),
        maxResults: z
          .number()
          .describe(
            "Maximum total number of matches across ALL scripts (default: unlimited). Use this to cap total matches, e.g. maxResults=1 to find just the first match."
          )
          .optional(),
        literal: z
          .boolean()
          .describe(
            "When true, treats the query as a plain literal string — no regex interpretation. Equivalent to grep -F / ripgrep -F. (default: false)"
          )
          .optional()
          .default(false),
        caseSensitive: z
          .boolean()
          .describe("When false, matches case-insensitively. Equivalent to grep -i. (default: true)")
          .optional()
          .default(true),
      }),
    },
    async ({ query, limit, contextLines, maxMatchesPerScript, maxResults, literal, caseSensitive }) =>
      sendAndWait({
        type: "script-grep",
        data: { query, limit, contextLines, maxMatchesPerScript, maxResults, literal, caseSensitive },
        failureMessage: (response) =>
          "Failed to grep scripts (error occured? Response: " + JSON.stringify(response) + ")",
      })
  );
}
