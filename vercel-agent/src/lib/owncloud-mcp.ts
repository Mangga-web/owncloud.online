import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolResultSchema,
  type CallToolRequest,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

export const READ_TOOLS = new Set([
  "files_list",
  "files_info",
  "files_read",
  "files_search",
]);

export const WRITE_TOOLS = new Set([
  "files_write",
  "files_mkdir",
  "files_move",
  "files_copy",
]);

export function limitReadToolInput(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const limited = { ...args };
  if (name === "files_read") {
    const requested = typeof limited.max_bytes === "number"
      ? Math.max(1, Math.floor(limited.max_bytes))
      : 20_000;
    limited.max_bytes = Math.min(requested, 20_000);
  } else if (name === "files_list") {
    const requested = typeof limited.limit === "number"
      ? Math.max(1, Math.floor(limited.limit))
      : 50;
    limited.limit = Math.min(requested, 50);
  } else if (name === "files_search") {
    const requested = typeof limited.limit === "number"
      ? Math.max(1, Math.floor(limited.limit))
      : 50;
    limited.limit = Math.min(requested, 50);
  }
  return limited;
}

export async function withOwnCloudMcp<T>(
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const endpoint = process.env.OWNCLOUD_MCP_URL;
  const username = process.env.OWNCLOUD_MCP_USERNAME;
  const appPassword = process.env.OWNCLOUD_MCP_APP_PASSWORD;
  if (!endpoint || !username || !appPassword) {
    throw new Error("ownCloud MCP environment variables are not configured.");
  }

  const endpointUrl = new URL(endpoint);
  const isLocalDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(endpointUrl.hostname);
  if (
    (endpointUrl.protocol !== "https:" && !isLocalDevelopment) ||
    endpointUrl.username ||
    endpointUrl.password ||
    endpointUrl.search ||
    endpointUrl.hash ||
    !endpointUrl.pathname.endsWith("/apps/oco_mcp/mcp")
  ) {
    throw new Error("OWNCLOUD_MCP_URL must be a secure ownCloud MCP endpoint.");
  }

  const authorization = Buffer.from(`${username}:${appPassword}`).toString(
    "base64",
  );
  const transport = new StreamableHTTPClientTransport(endpointUrl, {
    requestInit: {
      headers: { Authorization: `Basic ${authorization}` },
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    },
  });
  const client = new Client({
    name: "owncloud-integrator-vercel",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    return await run(client);
  } finally {
    await client.close();
  }
}

export function toAllowedTools(tools: Tool[]): Tool[] {
  return tools.filter(
    (tool) => READ_TOOLS.has(tool.name) || WRITE_TOOLS.has(tool.name),
  );
}

function isCallToolResult(value: unknown): value is CallToolResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(Reflect.get(value, "content"))
  );
}

export async function callOwnCloudTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const params: CallToolRequest["params"] = { name, arguments: args };
  const result = await client.callTool(params, CallToolResultSchema);
  if (!isCallToolResult(result)) {
    throw new Error("Task-based ownCloud MCP tools are not supported.");
  }
  return result;
}

export function mcpResultToText(result: CallToolResult): string {
  const content = result.content
    .map((item) => item.type === "text" ? item.text : `[${item.type}]`)
    .join("\n");
  const output =
    result.structuredContent !== undefined
      ? JSON.stringify(result.structuredContent)
      : content || "The tool returned no content.";
  return output.slice(0, 30_000);
}
