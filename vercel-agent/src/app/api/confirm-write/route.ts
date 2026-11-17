import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin, verifyWriteApproval } from "@/lib/security";
import {
  callOwnCloudTool,
  mcpResultToText,
  toAllowedTools,
  withOwnCloudMcp,
  WRITE_TOOLS,
} from "@/lib/owncloud-mcp";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  let body: { approvalToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (
    typeof body.approvalToken !== "string" ||
    body.approvalToken.length > 100_000
  ) {
    return NextResponse.json({ error: "Invalid approval." }, { status: 400 });
  }

  const approval = verifyWriteApproval(body.approvalToken);
  if (!approval || !WRITE_TOOLS.has(approval.name)) {
    return NextResponse.json(
      { error: "This approval is invalid or has expired." },
      { status: 400 },
    );
  }

  try {
    const result = await withOwnCloudMcp(async (client) => {
      const { tools } = await client.listTools();
      if (
        !toAllowedTools(tools).some((tool) => tool.name === approval.name)
      ) {
        throw new Error("The approved operation is no longer available.");
      }
      return callOwnCloudTool(client, approval.name, approval.args);
    });
    return NextResponse.json({
      ok: !result.isError,
      result: mcpResultToText(result),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown file operation failure.";
    console.error("OwnCloud file operation failed:", message);
    return NextResponse.json(
      { error: "ownCloud could not complete the approved operation." },
      { status: 502 },
    );
  }
}
