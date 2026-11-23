import "server-only";

import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { ensureCampaignBuildingSchema } from "@/lib/campaign-buildings";

type DatabaseContext = ReturnType<typeof createDatabaseContext>;

const globalDatabase = globalThis as typeof globalThis & {
  arentoriaDatabase?: DatabaseContext;
};

function createDatabaseContext() {
  const databasePath = path.join(process.cwd(), "data", "arentoria.sqlite");
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  ensureCampaignBuildingSchema(sqlite);
  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}

export function getDatabase() {
  if (!globalDatabase.arentoriaDatabase) {
    globalDatabase.arentoriaDatabase = createDatabaseContext();
  }
  return globalDatabase.arentoriaDatabase;
}
