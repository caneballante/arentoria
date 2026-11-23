import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";
import type { SearchResult } from "./types";

export const occupantDispositions = ["keep", "reference_only", "reassignment_planned", "manual_resolved"] as const;
export type OccupantDisposition = (typeof occupantDispositions)[number];
export const clearToken = "[CLEAR]";

export type CampaignBuildingOverride = {
  building_id: string;
  campaign_name: string | null;
  primary_use: string | null;
  specific_use: string | null;
  subtype: string | null;
  faith: string | null;
  faction_id: string | null;
  dm_notes: string | null;
  occupant_disposition: OccupantDisposition;
  approval_status: "approved";
  approved_at: string;
  source_reason: string | null;
  source_hash: string;
  updated_at: string;
};

export type BuildingContext = {
  buildingId: string;
  district: string;
  address: string | null;
  importedName: string | null;
  importedPrimaryUse: string | null;
  importedSpecificUse: string | null;
  residents: number;
  households: Array<{ id: string; lead: string | null; size: number }>;
  groupQuarters: Array<{ id: string; name: string | null; residents: number }>;
  workplace: { name: string; lead: string | null; staffCount: number } | null;
  associatedPeople: Array<{ id: string; name: string; connection: string }>;
  relationshipCounts: { familyEmployment: number; linkedPrompts: number };
  sourceHash: string;
  override: CampaignBuildingOverride | null;
};

export type BuildingProposal = {
  buildingId: string;
  sourceHash: string;
  action: string;
  campaignName: string | null;
  primaryUse: string | null;
  specificUse: string | null;
  subtype: string | null;
  faith: string | null;
  factionId: string | null;
  dmNotes: string | null;
  occupantDisposition: string | null;
  sourceReason: string | null;
};

export type ReviewedBuilding = {
  rowNumber: number;
  buildingId: string;
  status: "new" | "updated" | "unchanged" | "invalid" | "delete";
  errors: string[];
  warnings: string[];
  sourceChanged: boolean;
  context: BuildingContext | null;
  proposed: CampaignBuildingOverride | null;
};

type SourceRow = {
  stable_id: string;
  name: string | null;
  address: string | null;
  district_name: string;
  primary_land_use: string | null;
  specific_use: string | null;
  permanent_residents: number | null;
  workplace_name: string | null;
  lead_name: string | null;
  total_staff_count: number | null;
};

export function ensureCampaignBuildingSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS campaign_building_override (
      building_id TEXT PRIMARY KEY,
      campaign_name TEXT,
      primary_use TEXT,
      specific_use TEXT,
      subtype TEXT,
      faith TEXT,
      faction_id TEXT,
      dm_notes TEXT,
      occupant_disposition TEXT NOT NULL CHECK (occupant_disposition IN ('keep','reference_only','reassignment_planned','manual_resolved')),
      approval_status TEXT NOT NULL CHECK (approval_status = 'approved'),
      approved_at TEXT NOT NULL,
      source_reason TEXT,
      source_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaign_building_revision (
      id INTEGER PRIMARY KEY,
      batch_id TEXT NOT NULL,
      building_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      action TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS campaign_building_revision_building_idx
      ON campaign_building_revision (building_id, id DESC);
  `);
}

function sourceRow(sqlite: Database.Database, buildingId: string): SourceRow | null {
  return (sqlite.prepare(`
    SELECT b.stable_id, b.name, b.address, b.district_name,
           bc.primary_land_use, bc.specific_use, bc.permanent_residents,
           w.name AS workplace_name, w.lead_name, w.total_staff_count
    FROM building b
    LEFT JOIN building_census bc ON bc.building_id = b.stable_id AND bc.source_present = 1
    LEFT JOIN workplace w ON w.building_id = b.stable_id AND w.source_present = 1
    WHERE b.stable_id = ?
  `).get(buildingId) as SourceRow | undefined) ?? null;
}

export function sourceFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function getCampaignOverride(sqlite: Database.Database, buildingId: string) {
  return (sqlite.prepare("SELECT * FROM campaign_building_override WHERE building_id = ?")
    .get(buildingId) as CampaignBuildingOverride | undefined) ?? null;
}

export function getBuildingContext(sqlite: Database.Database, buildingId: string): BuildingContext | null {
  const source = sourceRow(sqlite, buildingId);
  if (!source) return null;
  const households = sqlite.prepare(`
    SELECT stable_id AS id, lead_name AS lead, household_size AS size
    FROM household WHERE building_id = ? AND source_present = 1 ORDER BY stable_id
  `).all(buildingId) as BuildingContext["households"];
  const groupQuarters = sqlite.prepare(`
    SELECT stable_id AS id, property_name AS name, resident_count AS residents
    FROM group_quarter WHERE building_id = ? AND source_present = 1 ORDER BY stable_id
  `).all(buildingId) as BuildingContext["groupQuarters"];
  const associatedPeople = sqlite.prepare(`
    SELECT p.stable_id AS id, p.display_name AS name,
           CASE WHEN rp.home_building_id = ? AND ws.person_id IS NOT NULL THEN 'resident and staff'
                WHEN rp.home_building_id = ? THEN 'resident'
                ELSE COALESCE(ws.staff_role, 'staff') END AS connection
    FROM person p
    LEFT JOIN resident_profile rp ON rp.person_id = p.stable_id AND rp.source_present = 1
    LEFT JOIN workplace_staff ws ON ws.person_id = p.stable_id
      AND ws.workplace_building_id = ? AND ws.source_present = 1
    WHERE rp.home_building_id = ? OR ws.person_id IS NOT NULL
    ORDER BY p.display_name
  `).all(buildingId, buildingId, buildingId, buildingId) as BuildingContext["associatedPeople"];
  const familyEmployment = (sqlite.prepare(`
    SELECT count(*) AS count FROM family_employment_link
    WHERE workplace_building_id = ? AND source_present = 1
  `).get(buildingId) as { count: number }).count;
  const linkedPrompts = (sqlite.prepare(`
    SELECT count(*) AS count FROM prompt_entity_link WHERE entity_stable_id = ?
  `).get(buildingId) as { count: number }).count;
  return {
    buildingId,
    district: source.district_name,
    address: source.address,
    importedName: source.name,
    importedPrimaryUse: source.primary_land_use,
    importedSpecificUse: source.specific_use,
    residents: source.permanent_residents ?? 0,
    households,
    groupQuarters,
    workplace: source.workplace_name ? {
      name: source.workplace_name,
      lead: source.lead_name,
      staffCount: source.total_staff_count ?? 0,
    } : null,
    associatedPeople,
    relationshipCounts: { familyEmployment, linkedPrompts },
    sourceHash: sourceFingerprint({ source, households, groupQuarters, associatedPeople, familyEmployment }),
    override: getCampaignOverride(sqlite, buildingId),
  };
}

export function listBuildingIds(sqlite: Database.Database, filter: { district?: string; category?: string; ids?: string[] }) {
  if (filter.ids?.length) {
    return [...new Set(filter.ids)].filter((id) => /^AR-\d{4}$/.test(id)).filter((id) => Boolean(sourceRow(sqlite, id)));
  }
  const rows = sqlite.prepare(`
    SELECT b.stable_id AS id FROM building b
    LEFT JOIN building_census bc ON bc.building_id = b.stable_id AND bc.source_present = 1
    LEFT JOIN campaign_building_override cbo ON cbo.building_id = b.stable_id
    WHERE (? = '' OR b.district_name = ?)
      AND (? = 'all' OR (? = 'institutional' AND COALESCE(cbo.primary_use,bc.primary_land_use) = 'Institutional')
        OR (? = 'temple' AND (lower(COALESCE(cbo.specific_use,bc.specific_use,'')) LIKE '%temple%'
          OR lower(COALESCE(cbo.specific_use,bc.specific_use,'')) LIKE '%chapel%'
          OR lower(COALESCE(cbo.specific_use,bc.specific_use,'')) LIKE '%shrine%'
          OR lower(COALESCE(cbo.subtype,'')) LIKE '%temple%'
          OR lower(COALESCE(cbo.subtype,'')) LIKE '%chapel%'
          OR lower(COALESCE(cbo.subtype,'')) LIKE '%shrine%'
          OR lower(COALESCE(cbo.subtype,'')) LIKE '%monastery%')))
    ORDER BY b.stable_id
  `).all(filter.district ?? "", filter.district ?? "", filter.category ?? "all", filter.category ?? "all", filter.category ?? "all") as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export function listBuildingOptions(sqlite: Database.Database, filter: { district?: string; category?: string; query?: string }) {
  const ids = listBuildingIds(sqlite, filter);
  const term = filter.query?.trim().toLocaleLowerCase() ?? "";
  return ids.map((id) => {
    const row = sourceRow(sqlite, id)!;
    const override = getCampaignOverride(sqlite, id);
    return {
      id,
      district: row.district_name,
      address: row.address,
      importedName: row.name,
      importedUse: row.specific_use,
      campaignName: override?.campaign_name ?? null,
      campaignUse: override?.specific_use ?? null,
      disposition: override?.occupant_disposition ?? null,
      hasOverride: Boolean(override),
    };
  }).filter((row) => !term || [row.id, row.address, row.importedName, row.importedUse, row.campaignName, row.campaignUse]
    .some((value) => value?.toLocaleLowerCase().includes(term)));
}

const editableFields = ["campaign_name", "primary_use", "specific_use", "subtype", "faith", "faction_id", "dm_notes", "source_reason"] as const;
type EditableField = (typeof editableFields)[number];

function proposedValue(value: string | null, previous: string | null) {
  if (value === null || value.trim() === "") return previous;
  return value.trim().toUpperCase() === clearToken ? null : value.trim();
}

function sameOverride(left: CampaignBuildingOverride | null, right: CampaignBuildingOverride) {
  return Boolean(left && editableFields.every((key) => left[key] === right[key])
    && left!.occupant_disposition === right.occupant_disposition);
}

export function reviewBuildingProposals(sqlite: Database.Database, proposals: BuildingProposal[]): ReviewedBuilding[] {
  const counts = new Map<string, number>();
  proposals.forEach((item) => counts.set(item.buildingId, (counts.get(item.buildingId) ?? 0) + 1));
  return proposals.map((item, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!/^AR-\d{4}$/.test(item.buildingId)) errors.push("Building ID must use AR-#### format.");
    if ((counts.get(item.buildingId) ?? 0) > 1) errors.push("Duplicate building ID in workbook.");
    const context = /^AR-\d{4}$/.test(item.buildingId) ? getBuildingContext(sqlite, item.buildingId) : null;
    if (!context) errors.push("Building ID is not on the mapped city census.");
    if (!/^[a-f0-9]{64}$/i.test(item.sourceHash)) errors.push("Missing or invalid source snapshot. Export a fresh workbook.");
    const sourceChanged = Boolean(context && context.sourceHash !== item.sourceHash);
    if (sourceChanged) errors.push("Source census changed since export. Export a fresh workbook before approving.");
    const action = item.action.trim().toLowerCase();
    if (action && action !== "delete") errors.push("Action must be blank or DELETE.");
    if (action === "delete" && !context?.override) errors.push("There is no approved override to delete.");
    const values: Record<EditableField, string | null> = {
      campaign_name: item.campaignName,
      primary_use: item.primaryUse,
      specific_use: item.specificUse,
      subtype: item.subtype,
      faith: item.faith,
      faction_id: item.factionId,
      dm_notes: item.dmNotes,
      source_reason: item.sourceReason,
    };
    for (const key of editableFields) {
      if (values[key] && values[key] !== clearToken && values[key]!.length > (key === "dm_notes" ? 3000 : 200)) {
        errors.push(`${key.replaceAll("_", " ")} is too long.`);
      }
    }
    const old = context?.override ?? null;
    const merged = Object.fromEntries(editableFields.map((key) => [key, proposedValue(values[key], old?.[key] ?? null)])) as Record<EditableField, string | null>;
    if (merged.faction_id && !/^FAC-\d+$/.test(merged.faction_id)) errors.push("Faction ID must use FAC-... format.");
    if (merged.faction_id && !(sqlite.prepare("SELECT 1 FROM faction WHERE stable_id = ? AND source_present = 1").get(merged.faction_id))) {
      errors.push("Faction ID does not exist in the current source.");
    }
    const disposition = item.occupantDisposition?.trim() || old?.occupant_disposition || "keep";
    if (!occupantDispositions.includes(disposition as OccupantDisposition)) errors.push("Choose a valid occupant disposition.");
    if (context && (context.residents > 0 || context.workplace?.staffCount) &&
        (merged.primary_use && merged.primary_use !== context.importedPrimaryUse ||
         merged.specific_use && merged.specific_use !== context.importedSpecificUse)) {
      warnings.push(`${context.residents} source residents, ${context.households.length} households, ${context.groupQuarters.length} group quarters and ${context.workplace?.staffCount ?? 0} workplace staff remain linked here.`);
      if (!item.occupantDisposition && !old?.occupant_disposition) {
        errors.push("Choose an occupant disposition for this use change.");
      }
    }
    if (item.buildingId === "AR-0172" && (merged.faith || merged.campaign_name || merged.specific_use)) {
      warnings.push("Temple of Dawnfire and Starfall requires DM review; Dawnfire is underground in campaign canon.");
    }
    const now = new Date().toISOString();
    const proposed: CampaignBuildingOverride | null = context && action !== "delete" ? {
      building_id: item.buildingId,
      ...merged,
      occupant_disposition: disposition as OccupantDisposition,
      approval_status: "approved",
      approved_at: old?.approved_at ?? now,
      source_hash: context.sourceHash,
      updated_at: now,
    } : null;
    const hasAuthoredValues = editableFields.some((key) => merged[key] !== null) || Boolean(item.occupantDisposition);
    const status: ReviewedBuilding["status"] = errors.length ? "invalid" : action === "delete" ? "delete" :
      !old && !hasAuthoredValues || proposed && sameOverride(old, proposed) ? "unchanged" : old ? "updated" : "new";
    return { rowNumber: index + 2, buildingId: item.buildingId, status, errors, warnings, sourceChanged, context, proposed };
  });
}

export async function backupCampaignDatabase(sqlite: Database.Database, directory = path.join(process.cwd(), "data", "backups")) {
  await mkdir(directory, { recursive: true });
  const filename = `arentoria-before-campaign-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${randomUUID().slice(0, 8)}.sqlite`;
  const backupPath = path.join(directory, filename);
  await sqlite.backup(backupPath);
  return backupPath;
}

const overrideColumns = "building_id,campaign_name,primary_use,specific_use,subtype,faith,faction_id,dm_notes,occupant_disposition,approval_status,approved_at,source_reason,source_hash,updated_at";

function writeOverride(sqlite: Database.Database, value: CampaignBuildingOverride) {
  sqlite.prepare(`INSERT INTO campaign_building_override (${overrideColumns}) VALUES (${Array(14).fill("?").join(",")})
    ON CONFLICT(building_id) DO UPDATE SET
      campaign_name=excluded.campaign_name,primary_use=excluded.primary_use,specific_use=excluded.specific_use,
      subtype=excluded.subtype,faith=excluded.faith,faction_id=excluded.faction_id,dm_notes=excluded.dm_notes,
      occupant_disposition=excluded.occupant_disposition,approval_status=excluded.approval_status,
      approved_at=excluded.approved_at,source_reason=excluded.source_reason,source_hash=excluded.source_hash,
      updated_at=excluded.updated_at`).run(...overrideColumns.split(",").map((column) => value[column as keyof CampaignBuildingOverride]));
}

export async function applyBuildingProposals(sqlite: Database.Database, proposals: BuildingProposal[], selectedIds: string[], backupDirectory?: string) {
  const reviewed = reviewBuildingProposals(sqlite, proposals);
  const selected = new Set(selectedIds);
  const chosen = reviewed.filter((row) => selected.has(row.buildingId));
  if (chosen.length !== selected.size) throw new Error("Some selected buildings are not in the workbook.");
  if (chosen.some((row) => row.status === "invalid")) throw new Error("Selected rows contain validation errors. Review the workbook again.");
  const changes = chosen.filter((row) => row.status !== "unchanged");
  if (!changes.length) return { applied: 0, backupPath: null };
  const backupPath = await backupCampaignDatabase(sqlite, backupDirectory);
  const batchId = randomUUID();
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    for (const row of changes) {
      if (getBuildingContext(sqlite, row.buildingId)?.sourceHash !== row.context?.sourceHash) {
        throw new Error(`Source facts changed for ${row.buildingId} during approval. Review a fresh export.`);
      }
    }
    const insertRevision = sqlite.prepare(`INSERT INTO campaign_building_revision
      (batch_id,building_id,before_json,after_json,action,changed_at) VALUES (?,?,?,?,?,?)`);
    for (const row of changes) {
      const before = getCampaignOverride(sqlite, row.buildingId);
      const after = row.status === "delete" ? null : { ...row.proposed!, approved_at: now, updated_at: now };
      if (after) writeOverride(sqlite, after);
      else sqlite.prepare("DELETE FROM campaign_building_override WHERE building_id = ?").run(row.buildingId);
      insertRevision.run(batchId, row.buildingId, before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null, row.status, now);
    }
  })();
  return { applied: changes.length, backupPath, batchId };
}

export function listBuildingRevisions(sqlite: Database.Database, limit = 40) {
  return sqlite.prepare(`SELECT id,batch_id,building_id,action,changed_at,before_json,after_json
    FROM campaign_building_revision ORDER BY id DESC LIMIT ?`).all(limit) as Array<{
      id: number; batch_id: string; building_id: string; action: string; changed_at: string;
      before_json: string | null; after_json: string | null;
    }>;
}

export async function restoreBuildingRevision(sqlite: Database.Database, revisionId: number, backupDirectory?: string) {
  const revision = sqlite.prepare("SELECT * FROM campaign_building_revision WHERE id = ?").get(revisionId) as {
    id: number; building_id: string; before_json: string | null;
  } | undefined;
  if (!revision) throw new Error("Revision not found.");
  const backupPath = await backupCampaignDatabase(sqlite, backupDirectory);
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const before = getCampaignOverride(sqlite, revision.building_id);
    const restored = revision.before_json ? JSON.parse(revision.before_json) as CampaignBuildingOverride : null;
    if (restored) writeOverride(sqlite, { ...restored, updated_at: now });
    else sqlite.prepare("DELETE FROM campaign_building_override WHERE building_id = ?").run(revision.building_id);
    sqlite.prepare(`INSERT INTO campaign_building_revision
      (batch_id,building_id,before_json,after_json,action,changed_at) VALUES (?,?,?,?,?,?)`)
      .run(randomUUID(), revision.building_id, before ? JSON.stringify(before) : null,
        restored ? JSON.stringify(restored) : null, "restore", now);
  })();
  return { buildingId: revision.building_id, backupPath };
}

export function listApprovedBuildingOverrides(sqlite: Database.Database) {
  return sqlite.prepare("SELECT * FROM campaign_building_override ORDER BY building_id").all() as CampaignBuildingOverride[];
}

export function campaignMapLabels(sqlite: Database.Database) {
  const rows = sqlite.prepare(`
    SELECT b.stable_id, COALESCE(cbo.campaign_name,b.name,b.stable_id) AS label, b.address
    FROM building b LEFT JOIN campaign_building_override cbo ON cbo.building_id = b.stable_id
  `).all() as Array<{ stable_id: string; label: string; address: string | null }>;
  return Object.fromEntries(rows.map((row) => [row.stable_id, { label: row.label, address: row.address }]));
}

export function searchCampaignBuildingOverrides(sqlite: Database.Database, query: string): SearchResult[] {
  const term = query.trim();
  if (!term) return [];
  const rows = sqlite.prepare(`
    SELECT cbo.building_id AS stable_id, COALESCE(cbo.campaign_name,b.name,b.stable_id) AS title,
           b.address AS subtitle, cbo.specific_use, cbo.subtype, cbo.faith
    FROM campaign_building_override cbo JOIN building b ON b.stable_id = cbo.building_id
    WHERE instr(lower(COALESCE(cbo.campaign_name,'')), lower(?)) > 0
       OR instr(lower(COALESCE(cbo.primary_use,'')), lower(?)) > 0
       OR instr(lower(COALESCE(cbo.specific_use,'')), lower(?)) > 0
       OR instr(lower(COALESCE(cbo.subtype,'')), lower(?)) > 0
       OR instr(lower(COALESCE(cbo.faith,'')), lower(?)) > 0
    ORDER BY cbo.building_id LIMIT 18
  `).all(term, term, term, term, term) as Array<{
    stable_id: string; title: string; subtitle: string | null; specific_use: string | null;
    subtype: string | null; faith: string | null;
  }>;
  return rows.map((row) => ({
    stableId: row.stable_id, kind: "building", title: row.title, subtitle: row.subtitle,
    excerpt: [row.specific_use, row.subtype, row.faith].filter(Boolean).join(" · ") || null,
  }));
}
