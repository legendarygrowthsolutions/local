import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CamelCasePlugin, HandleEmptyInListsPlugin, Kysely, MysqlDialect, PGliteDialect, PostgresDialect, SqliteAdapter, SqliteDialect, SqliteIntrospector, SqliteQueryCompiler, replaceWithNoncontingentExpression, type Dialect, type Driver, type Transaction } from "kysely";
import type { Database } from "./tables";

export type Db = Kysely<Database>;
export type DialectName = "sqlite" | "postgres" | "mysql";

/**
 * One SQL backend, chosen by DATABASE_URL:
 *   file:./data/local.db (default) → SQLite via better-sqlite3
 *   postgres://… / postgresql://…  → Postgres via `pg` (install it)
 *   mysql://…                      → MySQL via `mysql2` (install it)
 *   libsql://… (Turso)             → via `@libsql/kysely-libsql` + `@libsql/client` (install them)
 *   libsql+file:./data/local.db    → libSQL's embedded engine on a local file (same drivers)
 *   pglite:memory | pglite:./dir   → in-process Postgres (WASM) — used to run the test suite on Postgres
 * Services never see the dialect; repositories only use portable query-builder SQL.
 */
export function databaseUrl() {
  return process.env.DATABASE_URL || "file:./data/local.db";
}

export function dialectName(url = databaseUrl()): DialectName {
  if (/^postgres(ql)?:\/\//.test(url) || url.startsWith("pglite:")) return "postgres";
  if (url.startsWith("mysql://")) return "mysql";
  return "sqlite"; // file: paths and libsql both speak SQLite
}

// Optional drivers are loaded at runtime only when configured, so bundlers don't try to resolve them.
const load = (m: string) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ m) as Promise<Record<string, unknown>>;

function sqliteFile(url: string) {
  if (url === ":memory:" || url === "file::memory:") return ":memory:";
  // The database file lives outside the app bundle, so keep it out of output tracing.
  return resolve(/* turbopackIgnore: true */ process.cwd(), url.replace(/^file:/, ""));
}

/** `libsql://…` (Turso, remote) or `libsql+file:./path.db` (libSQL's embedded engine on a local file). */
const isLibsql = (url: string) => url.startsWith("libsql://") || url.startsWith("libsql+file:");

/**
 * `@libsql/kysely-libsql` builds its driver synchronously, but the driver package is loaded lazily, so
 * the dialect is assembled from Kysely's SQLite pieces plus a driver that resolves the real one on first use.
 */
function libsqlDialect(url: string): Dialect {
  let real: Promise<Driver> | null = null;
  const driver = () =>
    (real ??= (async () => {
      const [{ createClient }, { LibsqlDialect }] = (await Promise.all([load("@libsql/client"), load("@libsql/kysely-libsql")])) as [
        { createClient: (o: object) => { execute: (q: string) => Promise<unknown> } },
        { LibsqlDialect: new (o: object) => Dialect },
      ];
      const local = url.startsWith("libsql+file:");
      const client = local
        ? createClient({ url: "file:" + sqliteFile(url.slice("libsql+".length)), timeout: 5000 })
        : createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
      if (local) await client.execute("pragma journal_mode = WAL");
      const d = new LibsqlDialect({ client }).createDriver();
      await d.init();
      return d;
    })());
  const lazy: Driver = {
    init: async () => void (await driver()),
    acquireConnection: async () => (await driver()).acquireConnection(),
    beginTransaction: async (c, s) => (await driver()).beginTransaction(c, s),
    commitTransaction: async (c) => (await driver()).commitTransaction(c),
    rollbackTransaction: async (c) => (await driver()).rollbackTransaction(c),
    releaseConnection: async (c) => (await driver()).releaseConnection(c),
    destroy: async () => (real ? (await real).destroy() : undefined),
  };
  return {
    createAdapter: () => new SqliteAdapter(),
    createQueryCompiler: () => new SqliteQueryCompiler(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createDriver: () => lazy,
  };
}

function makeDialect(url: string): Dialect {
  const kind = dialectName(url);
  if (url.startsWith("pglite:")) {
    const where = url.slice("pglite:".length);
    return new PGliteDialect({
      pglite: async () => {
        const { PGlite } = (await load("@electric-sql/pglite")) as { PGlite: new (dir?: string) => never };
        return new PGlite(where === "memory" ? undefined : where);
      },
    });
  }
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
  if (isLibsql(url)) return libsqlDialect(url);
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
 * Run `fn` atomically. Nested calls join the outer transaction. On SQLite/libSQL writers are
 * serialised by the engine; on Postgres and MySQL we use SERIALIZABLE and retry the transient
 * conflicts it produces (Postgres 40001 / 40P01, MySQL deadlock 1213 / lock wait timeout 1205).
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const kind = dialectName();
  for (let attempt = 0; ; attempt++) {
    try {
      let builder = rootDb().transaction();
      if (kind !== "sqlite") builder = builder.setIsolationLevel("serializable");
      return await builder.execute((trx) => txStore.run(trx, fn));
    } catch (e) {
      if (attempt < 8 && isRetryable(kind, e)) {
        // Jittered backoff so contending transactions don't collide again in lockstep.
        await new Promise((r) => setTimeout(r, Math.random() * 10 * 2 ** Math.min(attempt, 5)));
        continue;
      }
      throw e;
    }
  }
}

function isRetryable(kind: DialectName, e: unknown) {
  const { code, errno } = e as { code?: string; errno?: number };
  if (kind === "postgres") return code === "40001" || code === "40P01";
  if (kind === "mysql") return errno === 1213 || errno === 1205;
  return false;
}

export async function closeDb() {
  if (g.__localDb) {
    await g.__localDb.db.destroy();
    g.__localDb = undefined;
  }
}
