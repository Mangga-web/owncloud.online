import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, setSessionCookie, verifyAccessPassword } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length > 256) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  try {
    if (!verifyAccessPassword(body.password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
  } catch {
    return NextResponse.json(
      { error: "The app access password is not configured correctly." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ authenticated: true });
  setSessionCookie(response);
  return response;
}
