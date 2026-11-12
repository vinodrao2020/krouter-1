/**
 * No-API-key usage must bucket the same way in every period.
 *
 * The 24h/today path keyed no-key rows by the bare "local-no-key", while the
 * daily path and the lastUsed overlay keyed them by "local-no-key|model|provider".
 * The result: the 24h view merged every no-key model into one row and credited
 * the requests to whichever model was seen last, while 7d/all split them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "krouter-nokey-parity-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

function usage(model) {
  return db.saveRequestUsage({
    provider: "openai", model, connectionId: "c1",
    tokens: { prompt_tokens: 1, completion_tokens: 1 },
    endpoint: "/v1/chat/completions", status: "ok",
  });
}

describe("no-key bucket parity across periods", () => {
  it("splits no-key traffic per model in 24h exactly as it does in all", async () => {
    await usage("nokey-model-a");
    await usage("nokey-model-b");

    const live = Object.keys((await db.getUsageStats("24h")).byApiKey).sort();
    const daily = Object.keys((await db.getUsageStats("all")).byApiKey).sort();

    expect(live).toEqual(daily);
    expect(live).toEqual([
      "local-no-key|nokey-model-a|openai",
      "local-no-key|nokey-model-b|openai",
    ]);
  });

  it("keeps each no-key model's own request count and name", async () => {
    const entries = Object.values((await db.getUsageStats("24h")).byApiKey);
    const byModel = Object.fromEntries(entries.map((e) => [e.rawModel, e]));
    expect(byModel["nokey-model-a"].requests).toBe(1);
    expect(byModel["nokey-model-b"].requests).toBe(1);
    expect(byModel["nokey-model-a"].keyName).toBe("Local (No API Key)");
  });
});
