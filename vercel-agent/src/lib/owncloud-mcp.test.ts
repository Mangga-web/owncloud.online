import assert from "node:assert/strict";
import { test } from "node:test";
import { limitReadToolInput } from "./owncloud-mcp";

test("file reads are capped and do not mutate the model input", () => {
  const input = { path: "/Documents/report.txt", max_bytes: 1_000_000 };

  assert.deepEqual(limitReadToolInput("files_read", input), {
    path: "/Documents/report.txt",
    max_bytes: 20_000,
  });
  assert.equal(input.max_bytes, 1_000_000);
});

test("listing and search results are capped", () => {
  assert.equal(limitReadToolInput("files_list", { limit: 500 }).limit, 50);
  assert.equal(limitReadToolInput("files_search", { limit: 500 }).limit, 50);
});
