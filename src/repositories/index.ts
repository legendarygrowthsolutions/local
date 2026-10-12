import "server-only";
import { mockRepository } from "./mock";
import type { Repository } from "./types";

// Phase 2: switch on process.env.DATA_SOURCE === "turso" to the Drizzle implementation.
export const repo: Repository = mockRepository;
export type { Repository };
