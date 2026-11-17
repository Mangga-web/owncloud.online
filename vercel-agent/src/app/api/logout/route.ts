import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const response = NextResponse.json({ authenticated: false });
  clearSessionCookie(response);
  return response;
}
