import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { closeDb, rootDb } from "@/db/client";
import { migrateToLatest } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import type { User } from "@/contracts";
import { repo } from "@/repositories";

const MYSQL_ROOT = process.env.TEST_MYSQL_URL || "mysql://root:test@127.0.0.1:33061";

/** Run one statement on a short-lived root connection (create/drop the per-file MySQL database). */
async function mysqlAdmin(statement: string) {
  const mysql = await import(/* @vite-ignore */ "mysql2/promise");
  const conn = await mysql.createConnection({ uri: MYSQL_ROOT });
  try {
    await conn.query(statement);
  } finally {
    await conn.end();
  }
}

/**
 * Give the calling test file its own migrated + seeded database. `rootDb()` reads DATABASE_URL
 * lazily, so pointing the env at a fresh database before the first query is enough.
 * TEST_DB picks the engine: unset → SQLite file, postgres → in-process PGlite,
 * mysql → a throwaway database on TEST_MYSQL_URL, libsql → libSQL's embedded engine on a file.
 * Returns the seed anchor (`now`).
 */
export function setupTestDb(now = new Date()) {
  const dir = mkdtempSync(join(tmpdir(), "local-test-"));
  const kind = process.env.TEST_DB ?? "sqlite";
  const mysqlDb = `local_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  process.env.DATABASE_URL =
    kind === "postgres" ? "pglite:memory"
    : kind === "mysql" ? `${MYSQL_ROOT}/${mysqlDb}`
    : kind === "libsql" ? "libsql+file:" + join(dir, "test.db")
    : "file:" + join(dir, "test.db");
  process.env.OTP_PROVIDER ??= "dev";
  beforeAll(async () => {
    if (kind === "mysql") await mysqlAdmin(`create database \`${mysqlDb}\` character set utf8mb4`);
    await migrateToLatest(rootDb());
    await seedDatabase(rootDb(), now);
  }, 60_000);
  afterAll(async () => {
    await closeDb();
    if (kind === "mysql") await mysqlAdmin(`drop database if exists \`${mysqlDb}\``);
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
