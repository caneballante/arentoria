import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { normalizeSearchQuery } from "./search";

const database = new Database(path.join(process.cwd(), "data", "arentoria.sqlite"), {
  readonly: true,
});

afterAll(() => database.close());

describe("prepared source integrity", () => {
  it("maps every supplied AR ID to exactly one building path", () => {
    const index = JSON.parse(
      readFileSync(path.join(process.cwd(), "data", "generated", "map-index.json"), "utf8"),
    ) as { count: number; fallbackCount: number; buildings: Array<{ stableId: string; pathId: string }> };
    expect(index.count).toBe(1676);
    expect(index.fallbackCount).toBe(0);
    expect(new Set(index.buildings.map((building) => building.stableId)).size).toBe(1676);
    expect(new Set(index.buildings.map((building) => building.pathId)).size).toBe(1676);
  });

  it("preserves the authored AR-0738 vertical slice", () => {
    const building = database
      .prepare("SELECT name, address, district_name FROM building WHERE stable_id = 'AR-0738'")
      .get() as { name: string; address: string; district_name: string };
    expect(building).toEqual({
      name: "Bilious's Magic Shoppe",
      address: "13 Councilor's Walk",
      district_name: "Grand Market",
    });

    const links = database
      .prepare(`
        SELECT link.entity_stable_id
        FROM prompt_entity_link link
        WHERE link.prompt_id = 'PROMPT:grand-market:03'
        ORDER BY link.entity_stable_id
      `)
      .all() as Array<{ entity_stable_id: string }>;
    expect(links.map((link) => link.entity_stable_id)).toContain("AR-0738");
    expect(links.map((link) => link.entity_stable_id)).toContain("P-08416");
  });

  it("imports the full census and normalized relationship tables", () => {
    const expectedCounts = {
      resident_profile: 10000,
      building_census: 1676,
      household: 1576,
      household_relationship: 6004,
      group_quarter: 432,
      workplace: 721,
      workplace_staff: 3839,
      family_employment_link: 205,
    };
    for (const [table, expected] of Object.entries(expectedCounts)) {
      const row = database.prepare(`SELECT count(*) AS count FROM ${table} WHERE source_present = 1`).get() as {
        count: number;
      };
      expect(row.count, table).toBe(expected);
    }
    expect(
      (
        database
          .prepare("SELECT count(*) AS count FROM person WHERE source_completeness = 'census-v20'")
          .get() as { count: number }
      ).count,
    ).toBe(10000);
  });

  it("resolves a person → home → household → workplace → coworker → faction chain in SQLite", () => {
    const profile = database
      .prepare(`
        SELECT residence_unit_id, home_building_id, workplace_building_id
        FROM resident_profile
        WHERE person_id = 'P-02359' AND source_present = 1
      `)
      .get() as {
      residence_unit_id: string;
      home_building_id: string;
      workplace_building_id: string;
    };
    expect(profile).toEqual({
      residence_unit_id: "HH-0701-01",
      home_building_id: "AR-0701",
      workplace_building_id: "AR-0002",
    });
    expect(
      (
        database
          .prepare("SELECT count(*) AS count FROM household_member WHERE household_id = ? AND source_present = 1")
          .get(profile.residence_unit_id) as { count: number }
      ).count,
    ).toBe(7);
    expect(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM workplace_staff WHERE workplace_building_id = ? AND source_present = 1",
          )
          .get(profile.workplace_building_id) as { count: number }
      ).count,
    ).toBe(16);
    expect(
      database
        .prepare(
          "SELECT faction_id FROM faction_membership WHERE person_id = 'P-02359' AND source_present = 1",
        )
        .pluck()
        .all(),
    ).toContain("FAC-018");
  });

  it("resolves a building → residents → workplace → associated people chain in SQLite", () => {
    const building = database
      .prepare(`
        SELECT b.address, bc.permanent_residents, w.name AS workplace, w.total_staff_count
        FROM building b
        JOIN building_census bc ON bc.building_id = b.stable_id AND bc.source_present = 1
        JOIN workplace w ON w.building_id = b.stable_id AND w.source_present = 1
        WHERE b.stable_id = 'AR-0600'
      `)
      .get() as {
      address: string;
      permanent_residents: number;
      workplace: string;
      total_staff_count: number;
    };
    expect(building).toEqual({
      address: "12 Guild Row",
      permanent_residents: 10,
      workplace: "Fox & Hare",
      total_staff_count: 8,
    });
    const residents = database
      .prepare("SELECT person_id FROM resident_profile WHERE home_building_id = 'AR-0600' AND source_present = 1")
      .pluck()
      .all();
    const staff = database
      .prepare(
        "SELECT person_id FROM workplace_staff WHERE workplace_building_id = 'AR-0600' AND source_present = 1",
      )
      .pluck()
      .all();
    expect(residents).toHaveLength(10);
    expect(staff).toHaveLength(8);
    expect(residents).toContain("P-02042");
    expect(staff).toContain("P-02042");
  });

  it("keeps CSV and workbook reads out of the running application", () => {
    const runtimeFiles = readdirSync(path.join(process.cwd(), "src"), { recursive: true, withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes(".test."),
      )
      .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8"));
    expect(runtimeFiles.join("\n")).not.toMatch(/full-census|\.csv|\.xlsx|readFile(?:Sync)?\(/i);
  });

  it("keeps the persistent DM story layer separate from source-owned imports", () => {
    const columns = database
      .prepare("PRAGMA table_info(story_profile)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "entity_stable_id",
        "demeanor",
        "wants",
        "knows",
        "secret",
        "current_problem",
        "recent_event",
        "memorable_detail",
        "loyalties",
        "dislikes",
      ]),
    );
    const importer = readFileSync(path.join(process.cwd(), "scripts", "import-sources.mjs"), "utf8");
    expect(importer).not.toMatch(/(?:DELETE|UPDATE)\s+(?:FROM\s+)?story_profile/i);
  });

  it("builds safe prefix queries for names and supplied IDs", () => {
    expect(normalizeSearchQuery("Bilious")).toBe('"Bilious"*');
    expect(normalizeSearchQuery("AR-0738")).toBe('"AR"* AND "0738"*');
  });

  it.each([
    ["Bilious", "AR-0738"],
    ["AR-0738", "AR-0738"],
    ["Vayne", "P-06572"],
    ["Grand Market", "DISTRICT:grand-market"],
  ])("finds %s in the categorized full-text index", (query, expectedStableId) => {
    const result = database
      .prepare(`
        SELECT stable_id
        FROM search_index
        WHERE search_index MATCH ?
        ORDER BY bm25(search_index, 4.0, 0.2, 8.0, 2.0, 1.0)
        LIMIT 20
      `)
      .all(normalizeSearchQuery(query)) as Array<{ stable_id: string }>;
    expect(result.map((row) => row.stable_id)).toContain(expectedStableId);
  });
});
