import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { ensureCampaignBuildingSchema } from "./campaign-buildings";

let sqlite: Database.Database;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({ sqlite }) }));

import { getPlaceCategories, getPlacesByType, searchEntities } from "./data";

beforeAll(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE building (stable_id TEXT PRIMARY KEY, name TEXT, address TEXT, district_name TEXT);
    CREATE TABLE workplace (building_id TEXT, name TEXT, address TEXT, district TEXT,
      specific_use TEXT, total_staff_count INTEGER, source_present INTEGER);
    CREATE VIRTUAL TABLE search_index USING fts5(stable_id, entity_type UNINDEXED, title, subtitle, body);
    INSERT INTO building VALUES ('AR-0001','Old Store','1 Guild Row','Scholarium');
    INSERT INTO building VALUES ('AR-0002','Second Store','2 Guild Row','Scholarium');
    INSERT INTO workplace VALUES ('AR-0001','Old Store','1 Guild Row','Scholarium','General shop',2,1);
    INSERT INTO workplace VALUES ('AR-0002','Second Store','2 Guild Row','Scholarium','General shop',3,1);
    INSERT INTO search_index VALUES ('AR-0001','building','Old Store','1 Guild Row','General shop');
    INSERT INTO search_index VALUES ('AR-0002','building','Second Store','2 Guild Row','General shop');
  `);
  ensureCampaignBuildingSchema(sqlite);
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO campaign_building_override
    (building_id,campaign_name,primary_use,specific_use,subtype,faith,faction_id,dm_notes,
     occupant_disposition,approval_status,approved_at,source_reason,source_hash,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "AR-0001", "Lantern Shrine", "Institutional", "Temple / chapel", "Shrine", "The Lantern",
      null, null, "keep", "approved", now, null, "fixture", now,
  );
  sqlite.prepare(`INSERT INTO campaign_building_override
    (building_id,campaign_name,primary_use,specific_use,subtype,faith,faction_id,dm_notes,
     occupant_disposition,approval_status,approved_at,source_reason,source_hash,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "AR-0002", "Quiet House", null, null, null, null,
      null, null, "reference_only", "approved", now, null, "fixture", now,
  );
});
afterAll(() => sqlite.close());

describe("campaign identity projections", () => {
  it("finds an approved name and faith in global search", () => {
    expect(searchEntities("Lantern Shrine")[0].title).toBe("Lantern Shrine");
    expect(searchEntities("The Lantern")[0].stableId).toBe("AR-0001");
  });

  it("lists approved use and subtype without presenting source-only workplace staff", () => {
    const categories = getPlaceCategories();
    expect(categories.flatMap((category) => category.types.map((type) => type.specificUse))).toContain("Shrine");
    expect(getPlacesByType("Shrine")[0].name).toBe("Lantern Shrine");
    expect(getPlacesByType("Temple / chapel")[0].stableId).toBe("AR-0001");
    expect(getPlacesByType("General shop")).toHaveLength(0);
  });
});
