import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/security";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isAuthenticated(request) });
}
