import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CamelCasePlugin, HandleEmptyInListsPlugin, Kysely, MysqlDialect, PostgresDialect, SqliteDialect, replaceWithNoncontingentExpression, type Dialect, type Transaction } from "kysely";
import type { Database } from "./tables";

export type Db = Kysely<Database>;
export type DialectName = "sqlite" | "postgres" | "mysql";

/**
 * One SQL backend, chosen by DATABASE_URL:
 *   file:./data/local.db (default) → SQLite via better-sqlite3
 *   postgres://… / postgresql://…  → Postgres via `pg` (install it)
 *   mysql://…                      → MySQL via `mysql2` (install it)
 *   libsql://… (Turso)             → via `@libsql/kysely-libsql` (install it)
 * Services never see the dialect; repositories only use portable query-builder SQL.
 */
export function databaseUrl() {
  return process.env.DATABASE_URL || "file:./data/local.db";
}

export function dialectName(url = databaseUrl()): DialectName {
  if (/^postgres(ql)?:\/\//.test(url)) return "postgres";
  if (url.startsWith("mysql://")) return "mysql";
  return "sqlite"; // file: paths and libsql:// both speak SQLite
}

// Optional drivers are loaded at runtime only when configured, so bundlers don't try to resolve them.
const load = (m: string) => (new Function("m", "return import(m)") as (m: string) => Promise<Record<string, unknown>>)(m);

function sqliteFile(url: string) {
  if (url === ":memory:" || url === "file::memory:") return ":memory:";
  return resolve(process.cwd(), url.replace(/^file:/, ""));
}

function makeDialect(url: string): Dialect {
  const kind = dialectName(url);
  if (kind === "postgres") {
    return new PostgresDialect({
      pool: async () => {
        const pg = (await load("pg")) as { default: { Pool: new (o: object) => unknown } };
        return pg.default.Pool ? new pg.default.Pool({ connectionString: url, max: 10 }) : (null as never);
      },
    } as ConstructorParameters<typeof PostgresDialect>[0]);
  }
  if (kind === "mysql") {
    return new MysqlDialect({
      pool: async () => {
        const mysql = (await load("mysql2")) as { createPool: (o: object) => unknown };
        return mysql.createPool({ uri: url, connectionLimit: 10 });
      },
    } as ConstructorParameters<typeof MysqlDialect>[0]);
  }
  if (url.startsWith("libsql://")) {
    // Turso: the libSQL dialect implements Kysely's Dialect directly.
    let inner: Dialect | null = null;
    const get = async () => {
      if (!inner) {
        const m = (await load("@libsql/kysely-libsql")) as { LibsqlDialect: new (o: object) => Dialect };
        inner = new m.LibsqlDialect({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
      }
      return inner;
    };
    const sqlite = new SqliteDialect({ database: async () => null as never });
    return {
      createAdapter: () => sqlite.createAdapter(),
      createQueryCompiler: () => sqlite.createQueryCompiler(),
      createIntrospector: (db) => sqlite.createIntrospector(db),
      createDriver: () => {
        let driver: ReturnType<Dialect["createDriver"]> | null = null;
        const d = async () => (driver ??= (await get()).createDriver());
        return {
          init: async () => (await d()).init(),
          acquireConnection: async () => (await d()).acquireConnection(),
          beginTransaction: async (c, s) => (await d()).beginTransaction(c, s),
          commitTransaction: async (c) => (await d()).commitTransaction(c),
          rollbackTransaction: async (c) => (await d()).rollbackTransaction(c),
          releaseConnection: async (c) => (await d()).releaseConnection(c),
          destroy: async () => (await d()).destroy(),
        };
      },
    };
  }
  return new SqliteDialect({
    database: async () => {
      const { default: Sqlite } = await import("better-sqlite3");
      const file = sqliteFile(url);
      if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
      const conn = new Sqlite(file);
      conn.pragma("journal_mode = WAL");
      conn.pragma("synchronous = NORMAL");
      conn.pragma("foreign_keys = ON");
      conn.pragma("busy_timeout = 5000");
      conn.pragma("cache_size = -16000"); // 16 MB page cache
      conn.pragma("temp_store = MEMORY");
      return conn;
    },
  });
}

export function createDb(url = databaseUrl()): Db {
  return new Kysely<Database>({
    dialect: makeDialect(url),
    plugins: [new CamelCasePlugin(), new HandleEmptyInListsPlugin({ strategy: replaceWithNoncontingentExpression })],
  });
}

const g = globalThis as unknown as { __localDb?: { url: string; db: Db } };

/** Process-wide root handle (survives dev hot reloads). */
export function rootDb(): Db {
  const url = databaseUrl();
  if (!g.__localDb || g.__localDb.url !== url) g.__localDb = { url, db: createDb(url) };
  return g.__localDb.db;
}

const txStore = new AsyncLocalStorage<Transaction<Database>>();

/** The current transaction if inside `withTransaction`, else the root handle. */
export function db(): Db {
  return txStore.getStore() ?? rootDb();
}

/**
 * Run `fn` atomically. Nested calls join the outer transaction. On SQLite the single connection
 * serialises transactions; on Postgres we use SERIALIZABLE and retry serialisation failures.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const kind = dialectName();
  for (let attempt = 0; ; attempt++) {
    try {
      let builder = rootDb().transaction();
      if (kind === "postgres") builder = builder.setIsolationLevel("serializable");
      return await builder.execute((trx) => txStore.run(trx, fn));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (kind === "postgres" && code === "40001" && attempt < 3) continue;
      throw e;
    }
  }
}

export async function closeDb() {
  if (g.__localDb) {
    await g.__localDb.db.destroy();
    g.__localDb = undefined;
  }
}
