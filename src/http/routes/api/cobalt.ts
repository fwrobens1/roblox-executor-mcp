import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../body.js";

interface CobaltLogEntry {
  id: string;
  remoteName: string;
  remotePath: string;
  direction: "incoming" | "outgoing";
  args: unknown[];
  timestamp: number;
  debugInfo?: string;
  generatedCode?: string;
  clientId?: string;
  placeId?: string;
  jobId?: string;
}

const MAX_LOGS = 5000;
const logs: CobaltLogEntry[] = [];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function jsonOk(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function jsonErr(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error }));
}

export function GET(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10), 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
  const filter = url.searchParams.get("filter") || "";
  const direction = url.searchParams.get("direction") || "";

  let filtered = logs;
  if (direction === "incoming" || direction === "outgoing") {
    filtered = filtered.filter((l) => l.direction === direction);
  }
  if (filter) {
    const q = filter.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.remoteName.toLowerCase().includes(q) ||
        l.remotePath.toLowerCase().includes(q) ||
        (l.generatedCode && l.generatedCode.toLowerCase().includes(q))
    );
  }

  const total = filtered.length;
  const sliced = filtered.slice().reverse().slice(offset, offset + limit);

  jsonOk(res, {
    logs: sliced,
    total,
    limit,
    offset,
  });
}

export async function POST(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody<Record<string, unknown>>(req);

    const entry: CobaltLogEntry = {
      id: generateId(),
      remoteName: String(body.remoteName || "Unknown"),
      remotePath: String(body.remotePath || ""),
      direction: body.direction === "incoming" ? "incoming" : "outgoing",
      args: Array.isArray(body.args) ? body.args : [],
      timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      debugInfo: body.debugInfo ? String(body.debugInfo) : undefined,
      generatedCode: body.generatedCode ? String(body.generatedCode) : undefined,
      clientId: body.clientId ? String(body.clientId) : undefined,
      placeId: body.placeId ? String(body.placeId) : undefined,
      jobId: body.jobId ? String(body.jobId) : undefined,
    };

    logs.push(entry);
    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }

    jsonOk(res, { success: true, id: entry.id });
  } catch (err) {
    jsonErr(res, 500, (err as Error).message || "Failed to store log");
  }
}

export function DELETE(_req: IncomingMessage, res: ServerResponse): void {
  logs.length = 0;
  jsonOk(res, { success: true });
}
