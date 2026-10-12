import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { closeDb, rootDb } from "@/db/client";
import { migrateToLatest } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import type { User } from "@/contracts";
import { repo } from "@/repositories";

/**
 * Give the calling test file its own migrated + seeded SQLite database in a temp directory.
 * `rootDb()` reads DATABASE_URL lazily, so pointing the env at the temp file before the first
 * query is enough. Returns the seed anchor (`now`).
 */
export function setupTestDb(now = new Date()) {
  const dir = mkdtempSync(join(tmpdir(), "local-test-"));
  process.env.DATABASE_URL = "file:" + join(dir, "test.db");
  process.env.OTP_PROVIDER ??= "dev";
  beforeAll(async () => {
    await migrateToLatest(rootDb());
    await seedDatabase(rootDb(), now);
  });
  afterAll(async () => {
    await closeDb();
    rmSync(dir, { recursive: true, force: true });
  });
  return now;
}

let n = 0;
/** Insert a fresh user with a unique phone (keeps per-user rate limits independent between tests). */
export async function makeUser(patch: Partial<User> = {}): Promise<User> {
  n++;
  const id = `u_test_${process.pid}_${n}_${Math.random().toString(36).slice(2, 7)}`;
  const phone = patch.phone ?? `7${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  return repo.users.insert({
    id,
    phone,
    name: "Test User",
    gender: null,
    dob: null,
    cityId: "c_mumbai",
    interests: [],
    role: "user",
    saved: [],
    following: [],
    createdAt: new Date().toISOString(),
    ...patch,
  });
}
