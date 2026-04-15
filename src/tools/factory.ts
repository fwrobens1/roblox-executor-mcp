import {
  GetResponseOfIdFromClient,
  SendArbitraryDataToClient,
} from "../bridge/handlers/shared/communication.js";
import { getActiveClientId } from "../bridge/handlers/shared/registry.js";
import type { RobloxResponse } from "../bridge/types.js";
import { INVALID_CLIENT_ERROR, NO_CLIENT_ERROR } from "./errors.js";

export interface ToolTextResponse {
  [x: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface SendAndWaitOptions {
  type: string;
  data: Record<string, unknown>;
  timeoutMs?: number;
  failureField?: "output" | "error";
  failureMessage?: (response: RobloxResponse | undefined) => string;
  successMessage?: (response: RobloxResponse) => string;
}

/**
 * Dispatch a request to the Roblox client and wait for the response.
 * Handles the no-client / invalid-client / timeout boilerplate that every
 * tool used to repeat.
 */
export async function sendAndWait(options: SendAndWaitOptions): Promise<ToolTextResponse> {
  const callId = SendArbitraryDataToClient(
    options.type,
    options.data,
    undefined,
    getActiveClientId()
  );

  if (callId === null) return NO_CLIENT_ERROR;
  if (callId === "INVALID_CLIENT") return INVALID_CLIENT_ERROR;

  const response = await GetResponseOfIdFromClient(callId, options.timeoutMs);
  const failureField = options.failureField ?? "output";

  const isFailure =
    response === undefined ||
    (failureField === "error"
      ? response.error !== undefined
      : response.output === undefined);

  if (isFailure) {
    const text =
      options.failureMessage?.(response) ??
      `Failed to ${options.type}. Response: ${JSON.stringify(response)}`;
    return { content: [{ type: "text", text }] };
  }

  const text =
    options.successMessage?.(response) ?? (response.output as string);
  return { content: [{ type: "text", text }] };
}

export interface FireAndForgetOptions {
  type: string;
  data: Record<string, unknown>;
  successMessage: string;
}

/**
 * Dispatch a request without waiting for a response.
 * Returns a success message once the request has been queued/sent.
 */
export function sendFireAndForget(options: FireAndForgetOptions): ToolTextResponse {
  const callId = SendArbitraryDataToClient(
    options.type,
    options.data,
    undefined,
    getActiveClientId()
  );

  if (callId === null) return NO_CLIENT_ERROR;
  if (callId === "INVALID_CLIENT") return INVALID_CLIENT_ERROR;

  return { content: [{ type: "text", text: options.successMessage }] };
}
