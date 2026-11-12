/**
 * lastUsed overlay and positive UTC offsets.
 *
 * getUsageStats("all"/"7d"/...) seeds lastUsed from usageDaily with a LOCAL
 * dateKey (YYYY-MM-DD) and then refines it from usageHistory with a precise
 * ISO timestamp. The refinement compared `new Date(ts) > new Date(dateKey)`,
 * and `new Date("2026-11-12")` is UTC midnight — which on a +07 host is later
 * than every timestamp on that local day, so between local midnight and the
 * offset the overlay never fired and the dashboard kept the day-level value.
 *
 * These tests pin the host to Asia/Bangkok so the bug reproduces on a UTC CI
 * box too, then restore the original TZ.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const originalTZ = process.env.TZ;

describe("lastUsed overlay on a positive-offset host", () => {
  beforeAll(() => {
    process.env.TZ = "Asia/Bangkok";
  });

  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("treats a date-only value as local midnight, not UTC midnight", async () => {
    const { lastUsedMs } = await import("@/lib/db/repos/usageRepo.js");
    expect(lastUsedMs("2026-11-12")).toBe(new Date(2026, 10, 12).getTime());
    // +07 local midnight is 17:00Z the previous day.
    expect(new Date(lastUsedMs("2026-11-12")).toISOString()).toBe("2026-11-11T17:00:00.000Z");
  });

  it("lets a precise timestamp replace the day-level value", async () => {
    const { lastUsedMs } = await import("@/lib/db/repos/usageRepo.js");
    // 2026-11-12 01:32 in Bangkok — the window where the old comparison failed.
    const ts = "2026-11-11T18:32:38.590Z";
    const dayKey = "2026-11-12";
    expect(lastUsedMs(ts)).toBeGreaterThan(lastUsedMs(dayKey));
    // The old implementation parsed the dayKey as UTC midnight, which is later
    // than ts — this assertion documents exactly what used to go wrong.
    expect(new Date(dayKey).getTime()).toBeGreaterThan(lastUsedMs(ts));
  });
});
