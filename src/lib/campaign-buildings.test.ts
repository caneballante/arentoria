import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  applyBuildingProposals, campaignMapLabels, clearToken, ensureCampaignBuildingSchema, getBuildingContext,
  getCampaignOverride, listBuildingRevisions, restoreBuildingRevision, reviewBuildingProposals,
  searchCampaignBuildingOverrides, listBuildingOptions,
  type BuildingProposal,
} from "./campaign-buildings";
import { exportCampaignWorkbook, parseCampaignWorkbook } from "./campaign-workbook";

function fixture() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE building (stable_id TEXT PRIMARY KEY, name TEXT, address TEXT, district_name TEXT);
    CREATE TABLE building_census (building_id TEXT, primary_land_use TEXT, specific_use TEXT,
      permanent_residents INTEGER, source_present INTEGER);
    CREATE TABLE workplace (building_id TEXT, name TEXT, lead_name TEXT, total_staff_count INTEGER,
      source_present INTEGER);
    CREATE TABLE household (stable_id TEXT, building_id TEXT, lead_name TEXT, household_size INTEGER,
      source_present INTEGER);
    CREATE TABLE group_quarter (stable_id TEXT, building_id TEXT, property_name TEXT,
      resident_count INTEGER, source_present INTEGER);
    CREATE TABLE person (stable_id TEXT, display_name TEXT);
    CREATE TABLE resident_profile (person_id TEXT, home_building_id TEXT, source_present INTEGER);
    CREATE TABLE workplace_staff (person_id TEXT, workplace_building_id TEXT, staff_role TEXT,
      source_present INTEGER);
    CREATE TABLE family_employment_link (workplace_building_id TEXT, source_present INTEGER);
    CREATE TABLE prompt_entity_link (entity_stable_id TEXT);
    CREATE TABLE faction (stable_id TEXT, source_present INTEGER);
    INSERT INTO building VALUES ('AR-0001','Old Store','1 Guild Row','Scholarium');
    INSERT INTO building_census VALUES ('AR-0001','Commercial','General shop',2,1);
    INSERT INTO workplace VALUES ('AR-0001','Old Store','Mira',1,1);
    INSERT INTO household VALUES ('HH-1','AR-0001','Mira',2,1);
    INSERT INTO person VALUES ('P-00001','Mira');
    INSERT INTO resident_profile VALUES ('P-00001','AR-0001',1);
    INSERT INTO workplace_staff VALUES ('P-00001','AR-0001','proprietor',1);
    INSERT INTO faction VALUES ('FAC-001',1);
  `);
  ensureCampaignBuildingSchema(sqlite);
  return sqlite;
}

function proposal(sqlite: Database.Database, patch: Partial<BuildingProposal> = {}): BuildingProposal {
  return {
    buildingId: "AR-0001", sourceHash: getBuildingContext(sqlite, "AR-0001")!.sourceHash,
    action: "", campaignName: null, primaryUse: null, specificUse: null,
    subtype: null, faith: null, factionId: null, dmNotes: null,
    occupantDisposition: null, sourceReason: null, ...patch,
  };
}

describe("campaign building overrides", () => {
  it("exports an Excel workbook that imports with stable IDs and blank proposals", async () => {
    const sqlite = fixture();
    const context = getBuildingContext(sqlite, "AR-0001")!;
    const parsed = await parseCampaignWorkbook(exportCampaignWorkbook([context]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].buildingId).toBe("AR-0001");
    expect(parsed[0].sourceHash).toBe(context.sourceHash);
    expect(reviewBuildingProposals(sqlite, parsed)[0].status).toBe("unchanged");
    sqlite.close();
  });

  it("rejects unknown and duplicate IDs and requires an occupant decision for a use change", () => {
    const sqlite = fixture();
    const change = proposal(sqlite, { specificUse: "Temple / chapel", campaignName: "Temple of the Lantern" });
    const unresolved = reviewBuildingProposals(sqlite, [change])[0];
    expect(unresolved.status).toBe("invalid");
    expect(unresolved.errors.join(" ")).toMatch(/occupant disposition/);
    const valid = reviewBuildingProposals(sqlite, [{ ...change, occupantDisposition: "reassignment_planned" }])[0];
    expect(valid.status).toBe("new");
    expect(valid.warnings.join(" ")).toMatch(/source residents/);
    expect(reviewBuildingProposals(sqlite, [change, change]).every((row) => row.status === "invalid")).toBe(true);
    expect(reviewBuildingProposals(sqlite, [{ ...change, buildingId: "AR-9999" }])[0].status).toBe("invalid");
    sqlite.close();
  });

  it("lists an approved temple subtype and finds its faith", async () => {
    const sqlite = fixture();
    const backups = mkdtempSync(path.join(os.tmpdir(), "arentoria-temple-test-"));
    const change = proposal(sqlite, {
      campaignName: "Lantern Shrine", primaryUse: "Institutional", specificUse: "Temple / chapel",
      subtype: "Shrine", faith: "The Lantern", occupantDisposition: "reassignment_planned",
    });
    await applyBuildingProposals(sqlite, [change], ["AR-0001"], backups);
    expect(listBuildingOptions(sqlite, { category: "temple" }).map((row) => row.id)).toEqual(["AR-0001"]);
    expect(listBuildingOptions(sqlite, { category: "institutional" }).map((row) => row.id)).toEqual(["AR-0001"]);
    expect(searchCampaignBuildingOverrides(sqlite, "The Lantern")[0].title).toBe("Lantern Shrine");
    sqlite.close();
  });

  it("applies partial changes, preserves source data, survives source updates, and restores history with backups", async () => {
    const sqlite = fixture();
    const backups = mkdtempSync(path.join(os.tmpdir(), "arentoria-override-test-"));
    const first = proposal(sqlite, { campaignName: "Lantern House", sourceReason: "Session note" });
    const applied = await applyBuildingProposals(sqlite, [first], ["AR-0001"], backups);
    expect(applied.applied).toBe(1);
    expect(existsSync(applied.backupPath!)).toBe(true);
    expect(getCampaignOverride(sqlite, "AR-0001")?.campaign_name).toBe("Lantern House");
    expect(campaignMapLabels(sqlite)["AR-0001"].label).toBe("Lantern House");
    expect(searchCampaignBuildingOverrides(sqlite, "Lantern House")[0].stableId).toBe("AR-0001");
    expect(listBuildingOptions(sqlite, { category: "temple" })).toHaveLength(0);
    expect((sqlite.prepare("SELECT name FROM building WHERE stable_id = 'AR-0001'").get() as { name: string }).name).toBe("Old Store");

    const second = proposal(sqlite, { dmNotes: "Open at night" });
    expect(reviewBuildingProposals(sqlite, [second])[0].proposed?.campaign_name).toBe("Lantern House");
    await applyBuildingProposals(sqlite, [second], ["AR-0001"], backups);
    expect(getCampaignOverride(sqlite, "AR-0001")?.dm_notes).toBe("Open at night");
    const third = proposal(sqlite, { campaignName: clearToken });
    await applyBuildingProposals(sqlite, [third], ["AR-0001"], backups);
    expect(getCampaignOverride(sqlite, "AR-0001")?.campaign_name).toBeNull();

    const originalExportHash = getBuildingContext(sqlite, "AR-0001")!.sourceHash;
    sqlite.prepare("INSERT INTO prompt_entity_link VALUES ('AR-0001')").run();
    expect(getBuildingContext(sqlite, "AR-0001")!.sourceHash).toBe(originalExportHash);
    sqlite.prepare("UPDATE building_census SET specific_use = 'Tailor' WHERE building_id = 'AR-0001'").run();
    expect(getCampaignOverride(sqlite, "AR-0001")?.dm_notes).toBe("Open at night");
    expect(reviewBuildingProposals(sqlite, [{ ...proposal(sqlite), sourceHash: originalExportHash }])[0].sourceChanged).toBe(true);

    const revision = listBuildingRevisions(sqlite)[0];
    const restored = await restoreBuildingRevision(sqlite, revision.id, backups);
    expect(existsSync(restored.backupPath)).toBe(true);
    expect(getCampaignOverride(sqlite, "AR-0001")?.campaign_name).toBe("Lantern House");
    sqlite.close();
  });
});
