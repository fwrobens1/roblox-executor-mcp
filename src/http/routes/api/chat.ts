import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../body.js";
import {
  GetResponseOfIdFromClient,
  SendArbitraryDataToClient,
} from "../../../bridge/handlers/shared/communication.js";
import {
  resolveTargetClient,
  setActiveClientId,
} from "../../../bridge/handlers/shared/registry.js";
import { getScriptSourceIndex } from "../../../bridge/handlers/shared/script-source-store.js";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  clientId?: string;
  model?: string;
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

const DEFAULT_MODEL = "gemini-3.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `You are Roblox AI, an expert Roblox game developer and exploiter integrated into the Roblox Executor MCP dashboard. You have direct access to a connected Roblox game client and can interact with it using tools.

Your capabilities:
- Execute Lua code in the game (fire-and-forget or with return values)
- Search through all decompiled scripts in the game
- Read script source code
- Search game instances
- Explore the instance hierarchy
- Read console output
- Get game metadata
- Read intercepted Cobalt remote spy logs (RemoteEvent/RemoteFunction calls)

When helping users:
1. Be concise but thorough in your responses
2. When asked to create scripts (e.g., fly scripts, GUIs, etc.), write complete, working Lua code and use the execute tool to run it
3. When analyzing game code, use script_grep and get_script_content to read relevant sources
4. Always prefer get_data_by_code when you need to read information from the game
5. Use execute for fire-and-forget operations (creating instances, setting properties, etc.)
6. If a script fails, diagnose the issue and fix it

Important: The game uses Luau (Roblox Lua). Use Roblox API conventions. setthreadidentity(8) is already applied to all executed code.

When writing scripts that create GUIs:
- Use ScreenGui with ResetOnExit = false
- Use modern Roblox UI components (Frame, TextButton, TextLabel, TextBox, UICorner, UIStroke, etc.)
- Position GUIs using AnchorPoint and Position properties
- Use scale-based sizing for responsiveness
- Add tweening for polish using TweenService

When writing fly scripts or similar exploits:
- Use RunService.RenderStepped for per-frame updates
- Use UserInputService for keybinds
- Handle edge cases (character respawn, death, etc.)
- Clean up connections when the script is disabled`;

const FUNCTION_DECLARATIONS = [
  {
    name: "execute",
    description:
      "Execute Lua code in the connected Roblox game client (fire-and-forget, no return value). Use this to trigger game actions, set values, create GUIs, run exploit scripts, etc.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        code: {
          type: "STRING" as const,
          description: "Lua code to execute in the Roblox client",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "get_data_by_code",
    description:
      "Execute Lua code and return the result as a string. Use this when you need to read data from the game. The code should return a value.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        code: {
          type: "STRING" as const,
          description:
            "Lua code that returns a value (e.g. 'return game.PlaceId')",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "get_game_info",
    description:
      "Get information about the currently connected Roblox game (place name, place ID, job ID, player info, etc.).",
    parameters: {
      type: "OBJECT" as const,
      properties: {},
    },
  },
  {
    name: "get_console_output",
    description:
      "Retrieve recent console output / print logs from the Roblox game client.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        limit: {
          type: "NUMBER" as const,
          description:
            "Max number of log lines to return (default 50, max 200)",
        },
        filter: {
          type: "STRING" as const,
          description: "Optional text filter for log messages",
        },
      },
    },
  },
  {
    name: "search_instances",
    description:
      "Search for instances in the Roblox game using CSS-like selectors (e.g. 'Part', 'Workspace > Part', '.ClassName').",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        selector: {
          type: "STRING" as const,
          description: "CSS-like selector to search instances",
        },
        root: {
          type: "STRING" as const,
          description: "Root instance path (default: 'game')",
        },
        limit: {
          type: "NUMBER" as const,
          description: "Max results (default 50, max 100)",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "get_descendants_tree",
    description:
      "Get the instance hierarchy tree starting from a root object in the Roblox game.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        root: {
          type: "STRING" as const,
          description:
            "Root instance path (e.g. 'game.Workspace', 'game.Players')",
        },
        maxDepth: {
          type: "NUMBER" as const,
          description: "Max depth to traverse (default 3, max 10)",
        },
        classFilter: {
          type: "STRING" as const,
          description: "Optional class name filter",
        },
      },
      required: ["root"],
    },
  },
  {
    name: "script_grep",
    description:
      "Search through all indexed script sources in the game for a pattern. Use this to find specific code patterns, function names, or variables.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        query: {
          type: "STRING" as const,
          description: "Search pattern (regex or literal string)",
        },
        literal: {
          type: "BOOLEAN" as const,
          description: "If true, treat query as literal string (default false)",
        },
        caseSensitive: {
          type: "BOOLEAN" as const,
          description: "If true, case-sensitive search (default true)",
        },
        limit: {
          type: "NUMBER" as const,
          description: "Max scripts to return (default 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_script_content",
    description:
      "Get the source code of a specific script by its path in the game hierarchy. Use this to read full script contents after finding them with script_grep.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        scriptPath: {
          type: "STRING" as const,
          description:
            "Full path of the script in the game (e.g. 'game.Workspace.MyScript')",
        },
        startLine: {
          type: "NUMBER" as const,
          description: "Start line number for partial content",
        },
        endLine: {
          type: "NUMBER" as const,
          description: "End line number for partial content",
        },
      },
      required: ["scriptPath"],
    },
  },
  {
    name: "semantic_search",
    description:
      "Natural language search across script sources using semantic embeddings. Use this when you know the behavior you want but not the exact code patterns.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        query: {
          type: "STRING" as const,
          description: "Natural language description of what to find",
        },
        limit: {
          type: "NUMBER" as const,
          description: "Max results (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_cobalt_logs",
    description:
      "Retrieve intercepted Cobalt remote spy logs. These are RemoteEvent/RemoteFunction calls captured from the game. Use this to analyze network traffic, understand server communication, or find remote names to exploit.",
    parameters: {
      type: "OBJECT" as const,
      properties: {
        limit: {
          type: "NUMBER" as const,
          description: "Max logs to return (default 50, max 200)",
        },
        direction: {
          type: "STRING" as const,
          description: "Filter by direction: 'incoming', 'outgoing', or 'all' (default)",
        },
        filter: {
          type: "STRING" as const,
          description: "Optional text filter for remote name or path",
        },
      },
    },
  },
];

async function callTool(
  name: string,
  args: Record<string, unknown>,
  clientId?: string
): Promise<string> {
  const target = resolveTargetClient(clientId);
  if (!target) return "Error: No active Roblox client connected.";
  if (clientId) setActiveClientId(clientId);

  try {
    if (name === "execute") {
      const code = args.code as string;
      if (!code) return "Error: Missing code parameter.";
      const id = SendArbitraryDataToClient(
        "execute",
        { source: `setthreadidentity(8);${code}` },
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch code to client.";
      return "Code executed successfully.";
    }

    if (name === "get_data_by_code") {
      const code = args.code as string;
      if (!code) return "Error: Missing code parameter.";
      const id = SendArbitraryDataToClient(
        "get-data-by-code",
        { source: `setthreadidentity(8);${code}` },
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 15000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "get_game_info") {
      const id = SendArbitraryDataToClient(
        "get-game-info",
        {},
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 15000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "get_console_output") {
      const data: Record<string, unknown> = {
        limit: Math.min(Number(args.limit) || 50, 200),
      };
      if (typeof args.filter === "string") data.filter = args.filter;
      const id = SendArbitraryDataToClient(
        "get-console-output",
        data,
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 15000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "search_instances") {
      const selector = args.selector as string;
      if (!selector) return "Error: Missing selector.";
      const data = {
        selector,
        root: (args.root as string) || "game",
        limit: Math.min(Number(args.limit) || 50, 100),
      };
      const id = SendArbitraryDataToClient(
        "search-instances",
        data,
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 15000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "get_descendants_tree") {
      const root = args.root as string;
      if (!root) return "Error: Missing root parameter.";
      const data: Record<string, unknown> = {
        root,
        maxDepth: Math.min(Number(args.maxDepth) || 3, 10),
      };
      if (args.classFilter) data.classFilter = args.classFilter;
      const id = SendArbitraryDataToClient(
        "get-descendants-tree",
        data,
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 15000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "script_grep") {
      const query = args.query as string;
      if (!query) return "Error: Missing query.";
      const index = getScriptSourceIndex({
        clientId: target.clientId,
        placeId: target.placeId,
        jobId: target.jobId,
      });
      if (!index.hasFinishedMapping) {
        return `Script index still loading (${index.mappedSources}/${index.sourcesToMap}). Try again shortly.`;
      }
      const literal = args.literal === true;
      const caseSensitive = args.caseSensitive !== false;
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
      const pattern = literal
        ? query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        : query;
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseSensitive ? "" : "i");
      } catch {
        return `Error: Invalid regex pattern.`;
      }
      const results: { path: string; matches: string[] }[] = [];
      for (const script of index.scripts) {
        if (results.length >= limit) break;
        const lines = script.source.split(/\r?\n/);
        const matches: string[] = [];
        for (let i = 0; i < lines.length && matches.length < 5; i++) {
          if (regex.test(lines[i] ?? "")) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length - 1, i + 1);
            const block: string[] = [];
            for (let j = start; j <= end; j++) {
              block.push(`${j === i ? ">" : " "} ${j + 1}: ${lines[j] ?? ""}`);
            }
            matches.push(block.join("\n"));
          }
        }
        if (matches.length > 0)
          results.push({ path: script.path || `<proxy>`, matches });
      }
      if (results.length === 0) return `No matches found for "${query}".`;
      return results
        .map((r) => `[${r.path}]\n${r.matches.join("\n---\n")}`)
        .join("\n\n");
    }

    if (name === "get_script_content") {
      const scriptPath = args.scriptPath as string;
      if (!scriptPath) return "Error: Missing scriptPath.";
      const index = getScriptSourceIndex({
        clientId: target.clientId,
        placeId: target.placeId,
        jobId: target.jobId,
      });
      const stored = index.scripts.find((s) => s.path === scriptPath);
      if (stored) {
        let source = stored.source;
        if (args.startLine !== undefined) {
          const lines = source.split(/\r?\n/);
          const start = Math.max(
            1,
            Math.min(Math.floor(Number(args.startLine)), lines.length)
          );
          const end =
            args.endLine !== undefined
              ? Math.max(
                  start,
                  Math.min(Math.floor(Number(args.endLine)), lines.length)
                )
              : lines.length;
          source =
            `-- Lines ${start}-${end} of ${lines.length}\n` +
            lines.slice(start - 1, end).join("\n");
        }
        return source;
      }
      const id = SendArbitraryDataToClient(
        "get-script-content",
        { source: `return ${scriptPath}` },
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 15000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "semantic_search") {
      const query = args.query as string;
      if (!query) return "Error: Missing query.";
      const id = SendArbitraryDataToClient(
        "semantic-search",
        { query, limit: Math.min(Number(args.limit) || 10, 50) },
        undefined,
        target.clientId
      );
      if (!id || id === "INVALID_CLIENT")
        return "Error: Failed to dispatch.";
      const resp = await GetResponseOfIdFromClient(id, 120000);
      if (resp.error) return `Error: ${resp.error}`;
      return resp.output ?? "No output returned.";
    }

    if (name === "get_cobalt_logs") {
      const limit = Math.min(Number(args.limit) || 50, 200);
      const direction = String(args.direction || "all");
      const filter = args.filter ? String(args.filter) : "";
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          direction: direction === "all" ? "" : direction,
          filter,
        });
        const res = await fetch(
          `http://localhost:16384/api/cobalt/logs?${params.toString()}`
        );
        if (!res.ok) return `Error: Failed to fetch Cobalt logs (${res.status})`;
        const data = (await res.json()) as {
          logs: Array<{
            remoteName: string;
            remotePath: string;
            direction: string;
            args: unknown[];
            timestamp: number;
            generatedCode?: string;
            debugInfo?: string;
          }>;
          total: number;
        };
        if (!data.logs || data.logs.length === 0) {
          return "No Cobalt remote spy logs found. Install the Cobalt plugin and intercept some remotes first.";
        }
        const lines = data.logs.map((log, i) => {
          const d = new Date(log.timestamp);
          const time = d.toLocaleTimeString("en-US", { hour12: false });
          let s = `[${i + 1}] ${time} ${log.direction.toUpperCase()} ${log.remoteName}\n  Path: ${log.remotePath}`;
          if (log.args && log.args.length > 0) {
            s += `\n  Args: ${JSON.stringify(log.args).slice(0, 300)}`;
          }
          if (log.generatedCode) {
            s += `\n  Code:\n${log.generatedCode.slice(0, 500)}`;
          }
          return s;
        });
        return `Found ${data.logs.length} remote spy logs (total: ${data.total}):\n\n${lines.join("\n\n")}`;
      } catch (err) {
        return `Error fetching Cobalt logs: ${(err as Error).message || String(err)}`;
      }
    }

    return `Error: Unknown tool "${name}".`;
  } catch (err) {
    return `Error: ${(err as Error).message || String(err)}`;
  }
}

async function runChat(
  messages: ChatMessage[],
  clientId?: string,
  modelOverride?: string
): Promise<{ reply: string; toolCalls: { name: string; result: string }[]; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const model = modelOverride || DEFAULT_MODEL;
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const toolCallLog: { name: string; result: string }[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 8192,
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let friendlyMsg = `Gemini API error (${resp.status})`;
      try {
        const errJson = JSON.parse(errText) as {
          error?: { code?: number; message?: string; status?: string };
        };
        const apiMsg = errJson.error?.message ?? "";
        if (resp.status === 429) {
          if (apiMsg.includes("limit: 0")) {
            friendlyMsg =
              "Your Gemini API key has no free-tier quota for this model. " +
              "Please enable billing on your Google Cloud project at " +
              "https://console.cloud.google.com/billing, or get a fresh AI Studio key at " +
              "https://aistudio.google.com/app/apikey";
          } else {
            friendlyMsg =
              "Gemini API rate limit hit. Please wait a moment and try again.";
          }
        } else if (resp.status === 404) {
          friendlyMsg = `Model "${model}" not found. Try a different model name.`;
        } else if (resp.status === 400) {
          friendlyMsg = `Gemini API request error: ${apiMsg}`;
        } else if (resp.status === 403 || resp.status === 401) {
          friendlyMsg =
            "Invalid or unauthorized GEMINI_API_KEY. Please check your key at https://aistudio.google.com/app/apikey";
        } else {
          friendlyMsg = `Gemini API error (${resp.status}): ${apiMsg || errText}`;
        }
      } catch {
        friendlyMsg = `Gemini API error (${resp.status}): ${errText.slice(0, 200)}`;
      }
      throw new Error(friendlyMsg);
    }

    const data = (await resp.json()) as {
      candidates?: {
        content?: {
          role?: string;
          parts?: GeminiPart[];
        };
        finishReason?: string;
      }[];
    };

    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error("No response from Gemini.");
    }

    const parts = candidate.content.parts;
    const modelContent: GeminiContent = { role: "model", parts };
    contents.push(modelContent);

    const functionCalls = parts.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p
    );

    if (functionCalls.length === 0) {
      const textPart = parts.find((p): p is { text: string } => "text" in p);
      return {
        reply: textPart?.text ?? "No response.",
        toolCalls: toolCallLog,
        model,
      };
    }

    const responseParts: GeminiPart[] = [];
    for (const fc of functionCalls) {
      const result = await callTool(
        fc.functionCall.name,
        fc.functionCall.args ?? {},
        clientId
      );
      toolCallLog.push({ name: fc.functionCall.name, result });
      responseParts.push({
        functionResponse: {
          name: fc.functionCall.name,
          response: { result },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    reply: "Maximum tool call rounds reached.",
    toolCalls: toolCallLog,
    model,
  };
}

function jsonOk(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function jsonErr(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error }));
}

export function GET(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      model: DEFAULT_MODEL,
      configured: !!process.env.GEMINI_API_KEY,
      models: [
        { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", default: true },
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", default: false },
      ],
    })
  );
}

export async function POST(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody<ChatRequest>(req);
    const { messages, clientId, model: modelOverride } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonErr(res, 400, "Missing or empty 'messages' array.");
    }

    const { reply, toolCalls, model } = await runChat(
      messages,
      clientId,
      modelOverride
    );
    jsonOk(res, { reply, toolCalls, model });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    jsonErr(res, 500, msg);
  }
}
