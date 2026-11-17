import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "owncloud_agent_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const APPROVAL_TTL_SECONDS = 5 * 60;

type SignedPayload = {
  type: "session" | "write-approval";
  exp: number;
  name?: string;
  args?: Record<string, unknown>;
};

function getSessionSecret(): string {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("APP_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function createSignedToken(payload: SignedPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifySignedToken(token: string): SignedPayload | null {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expectedSignature = Buffer.from(sign(encoded));
  const actualSignature = Buffer.from(suppliedSignature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SignedPayload;
    if (
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    request.nextUrl.protocol.slice(0, -1);
  if (!origin || !host || !["http", "https"].includes(protocol)) return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.origin === origin &&
      parsedOrigin.host.toLowerCase() === host.toLowerCase() &&
      parsedOrigin.protocol === `${protocol}:`
    );
  } catch {
    return false;
  }
}

export function isAuthenticated(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const payload = verifySignedToken(token);
  return payload?.type === "session";
}

export function verifyAccessPassword(password: string): boolean {
  const expected = process.env.APP_ACCESS_PASSWORD;
  if (!expected || expected.length < 20) {
    throw new Error("APP_ACCESS_PASSWORD must contain at least 20 characters.");
  }
  return safeEqual(password, expected);
}

export function setSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, createSignedToken({
    type: "session",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function createWriteApproval(
  name: string,
  args: Record<string, unknown>,
): string {
  return createSignedToken({
    type: "write-approval",
    exp: Math.floor(Date.now() / 1000) + APPROVAL_TTL_SECONDS,
    name,
    args,
  });
}

export function verifyWriteApproval(
  token: string,
): { name: string; args: Record<string, unknown> } | null {
  const payload = verifySignedToken(token);
  if (
    payload?.type !== "write-approval" ||
    typeof payload.name !== "string" ||
    !payload.args ||
    typeof payload.args !== "object" ||
    Array.isArray(payload.args)
  ) {
    return null;
  }
  return { name: payload.name, args: payload.args };
}
