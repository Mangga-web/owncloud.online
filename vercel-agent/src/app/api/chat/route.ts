import { NextRequest, NextResponse } from "next/server";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  callClaude,
  type ChatMessage,
  type ClaudeMessage,
  type ClaudeToolResult,
} from "@/lib/anthropic";
import {
  createWriteApproval,
  isAuthenticated,
  isSameOrigin,
} from "@/lib/security";
import {
  limitReadToolInput,
  callOwnCloudTool,
  mcpResultToText,
  READ_TOOLS,
  toAllowedTools,
  withOwnCloudMcp,
  WRITE_TOOLS,
} from "@/lib/owncloud-mcp";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 5_000;
const MAX_TOTAL_LENGTH = 18_000;
const MAX_TOOL_CALLS_PER_TURN = 4;
const MAX_TOOL_ROUNDS = 5;
const MAX_WRITE_INPUT_LENGTH = 64_000;

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const selected = value.slice(-MAX_MESSAGES);
  let totalLength = 0;
  const messages: ChatMessage[] = [];

  for (const item of selected) {
    if (
      !item ||
      typeof item !== "object" ||
      !("role" in item) ||
      !("content" in item)
    ) {
      return null;
    }
    const role = item.role;
    const content = item.content;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.length === 0 ||
      content.length > MAX_MESSAGE_LENGTH
    ) {
      return null;
    }
    totalLength += content.length;
    if (totalLength > MAX_TOTAL_LENGTH) return null;
    messages.push({ role, content });
  }

  if (messages.at(-1)?.role !== "user") return null;
  return messages;
}

function toClaudeTools(tools: Tool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: (tool.description || `Use ${tool.name}.`).slice(0, 2_000),
    input_schema: tool.inputSchema as Record<string, unknown>,
  }));
}

function getText(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("\n")
    .slice(0, 10_000);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const messages = parseMessages(body.messages);
  if (!messages) {
    return NextResponse.json({ error: "Invalid or oversized chat history." }, { status: 400 });
  }

  try {
    const result = await withOwnCloudMcp(async (client) => {
      const { tools } = await client.listTools();
      const allowedTools = toAllowedTools(tools);
      if (allowedTools.length === 0) {
        throw new Error("The ownCloud MCP server exposes no supported file tools.");
      }

      const conversation: ClaudeMessage[] = messages.map((message) => ({ ...message }));

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await callClaude(conversation, toClaudeTools(allowedTools));
        const text = getText(response.content);
        const toolUses = response.content.filter((block) => block.type === "tool_use");

        if (toolUses.length === 0) {
          return { answer: text || "No response was returned." };
        }
        if (toolUses.length > MAX_TOOL_CALLS_PER_TURN) {
          return { answer: "This request needs too many file operations. Please narrow it down." };
        }

        const writeUse = toolUses.find((toolUse) => WRITE_TOOLS.has(toolUse.name));
        if (writeUse) {
          const serialized = JSON.stringify(writeUse.input);
          if (serialized.length > MAX_WRITE_INPUT_LENGTH) {
            return { answer: "The proposed change is too large to review safely. Please split it into smaller changes." };
          }
          return {
            answer: text,
            pendingWrite: {
              name: writeUse.name,
              input: writeUse.input,
              approvalToken: createWriteApproval(writeUse.name, writeUse.input),
            },
          };
        }

        conversation.push({ role: "assistant", content: response.content });
        const toolResults: ClaudeToolResult[] = [];
        for (const toolUse of toolUses) {
          if (!READ_TOOLS.has(toolUse.name)) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: "This tool is not allowed.",
              is_error: true,
            });
            continue;
          }
          const toolResult = await callOwnCloudTool(
            client,
            toolUse.name,
            limitReadToolInput(toolUse.name, toolUse.input),
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: mcpResultToText(toolResult),
            is_error: toolResult.isError,
          });
        }
        conversation.push({ role: "user", content: toolResults });
      }

      return { answer: "I reached the limit for this turn. Please ask a narrower question." };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown agent request failure.";
    console.error("OwnCloud agent request failed:", message);
    return NextResponse.json(
      { error: "The agent could not complete the request. Check the server configuration and try again." },
      { status: 502 },
    );
  }
}
