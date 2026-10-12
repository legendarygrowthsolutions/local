import "server-only";
import { sqlRepository } from "./sql";
import type { Repository } from "./types";

export const repo: Repository = sqlRepository;
export type { Repository };
