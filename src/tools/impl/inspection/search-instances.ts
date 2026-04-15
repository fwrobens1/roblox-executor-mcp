import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendAndWait } from "../../factory.js";

export default function register(server: McpServer): void {
  server.registerTool(
    "search-instances",
    {
      title: "Search for instances in the game",
      description: `Search for instances in the Roblox game using QueryDescendants with a CSS-like selector syntax. Supports class names (Part), tags (.Tag), names (#Name), properties ([Property = value]), attributes ([$Attribute = value]), combinators (>, >>), and pseudo-classes (:not(), :has()).

SELECTOR SYNTAX:
- ClassName: Matches instances of a class (uses IsA, so 'BasePart' matches Part, MeshPart, etc.). Example: Part, SpotLight, Model
- .Tag: Matches instances with a CollectionService tag. Example: .Fruit, .Enemy, .Interactable
- #Name: Matches instances by their Name property. Example: #HumanoidRootPart, #Head, #Torso
- [Property = value]: Matches instances where a property equals a value (boolean, number, string). Example: [CanCollide = false], [Transparency = 1], [Name = Folder10]
- [$Attribute = value]: Matches instances with a specific attribute value. Example: [$Health = 100], [$IsEnemy = true]
- [$Attribute]: Matches instances that have the attribute set (any value). Example: [$QuestId]

COMBINATORS:
- > : Direct children only. Example: Model > Part (Parts that are direct children of a Model)
- >> : All descendants (default). Example: Model >> Part (Parts anywhere inside a Model)
- , : Multiple selectors (OR). Example: Part, MeshPart (matches either)

PSEUDO-CLASSES:
- :not(selector): Excludes matches. Example: BasePart:not([CanCollide = true]) - parts with CanCollide false
- :has(selector): Matches if containing a descendant. Example: Model:has(> Humanoid) - Models with a Humanoid child

COMBINING SELECTORS: Chain selectors for AND logic. Example: Part.Tagged[Anchored = false] - Parts with tag "Tagged" that are unanchored`,
      inputSchema: z.object({
        selector: z
          .string()
          .describe(
            "The selector string to filter instances (e.g., 'Part', '.Tagged', '#InstanceName', '[CanCollide = false]', 'Model >> Part.Glowing')"
          ),
        root: z
          .string()
          .describe(
            "The root instance to search from (e.g., 'game.Workspace', 'game.ReplicatedStorage'). Defaults to 'game' if not specified."
          )
          .optional()
          .default("game"),
        limit: z
          .number()
          .describe("Maximum number of results to return (default: 50, to avoid overwhelming output)")
          .optional()
          .default(50),
      }),
    },
    async ({ selector, root, limit }) =>
      sendAndWait({
        type: "search-instances",
        data: { selector, root, limit },
        failureMessage: (response) =>
          "Failed to search instances. Response: " + JSON.stringify(response),
      })
  );
}
