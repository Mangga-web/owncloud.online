import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import {
  createWriteApproval,
  isSameOrigin,
  verifyWriteApproval,
} from "./security";

process.env.APP_SESSION_SECRET = "test-secret-with-at-least-32-characters";

test("write approval token preserves the approved operation", () => {
  const args = { path: "/Documents/notes.txt", content: "Updated text" };
  const token = createWriteApproval("files_write", args);

  assert.deepEqual(verifyWriteApproval(token), {
    name: "files_write",
    args,
  });
});

test("tampered write approval token is rejected", () => {
  const token = createWriteApproval("files_write", {
    path: "/Documents/notes.txt",
    content: "Updated text",
  });
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

  assert.equal(verifyWriteApproval(tampered), null);
});

test("same-origin validation uses the incoming host behind a local proxy", () => {
  const request = new NextRequest("http://localhost:3000/api/login", {
    headers: {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
    },
  });

  assert.equal(isSameOrigin(request), true);
});

test("cross-origin login requests are rejected", () => {
  const request = new NextRequest("https://agent.example/api/login", {
    headers: {
      host: "agent.example",
      origin: "https://attacker.example",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(isSameOrigin(request), false);
});
