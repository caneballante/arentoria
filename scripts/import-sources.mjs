import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import readXlsxFile from "read-excel-file/node";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const databasePath = path.join(projectRoot, "data", "arentoria.sqlite");
const mapIndexPath = path.join(projectRoot, "data", "generated", "map-index.json");
const reportsDirectory = path.join(projectRoot, "data", "reports");
const backupsDirectory = path.join(projectRoot, "data", "backups");

const sourceFiles = {
  prompts: "Arentoria_district_prompts_v21.csv",
  roads: "Arentoria_road_names_complete_v15.csv",
  factions: "Arentoria_factions_pressure_network_v21.xlsx",
  map: "Arentoria_master_map.svg",
  residentsCurrent: "source/full-census/residents_current_v20.csv",
  buildingsCurrent: "source/full-census/buildings_current_v20.csv",
  residentsWorkforce: "source/full-census/residents_workforce_v19.csv",
  buildingsWorkforce: "source/full-census/buildings_workforce_v19.csv",
  householdsWorkforce: "source/full-census/households_workforce_v19.csv",
  householdRelationships: "source/full-census/household_relationships_v19.csv",
  workplaceStaff: "source/full-census/workplace_staff_v19.csv",
  establishmentsStaffed: "source/full-census/establishments_staffed_v19.csv",
  familyEmploymentLinks: "source/full-census/family_employment_links_v19.csv",
  groupQuartersWorkforce: "source/full-census/group_quarters_workforce_v19.csv",
  workforceSummary: "source/full-census/workforce_summary_v19.csv",
};

const mapDistrictAliases = new Map([
  ["Unassigned Exterior", "Outside the Walls / Farm Approaches"],
]);
const canonicalDistrict = (value) => mapDistrictAliases.get(String(value)) ?? String(value);

const splitList = (value) =>
  String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

const slugify = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const rowHash = (value) => hash(JSON.stringify(value));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (quoted) throw new Error("CSV ended inside a quoted field.");
  return rows;
}

function recordsFromRows(rows, headerIndex = 0) {
  const headers = rows[headerIndex].map((header) => String(header ?? "").replace(/^\uFEFF/, "").trim());
  return rows.slice(headerIndex + 1).flatMap((values, index) => {
    if (values.every((value) => value === null || value === "")) return [];
    return [
      {
        sourceRow: headerIndex + index + 2,
        value: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])),
      },
    ];
  });
}

function assertUnique(records, key, label) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    const value = key(record);
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate IDs: ${[...new Set(duplicates)].join(", ")}`);
  }
}

function parseLocationLabel(value) {
  const [name = "", ...addressParts] = String(value ?? "").split(/\s+—\s+/);
  return {
    name: name.trim() || null,
    address: addressParts.join(" — ").trim() || null,
  };
}

function setPerson(people, stableId, name, provenance, issues) {
  if (!stableId) return;
  const existing = people.get(stableId);
  const normalizedName = String(name ?? "").trim() || null;
  if (existing?.name && normalizedName && existing.name !== normalizedName) {
    issues.push({
      severity: "warning",
      code: "PERSON_NAME_VARIANT",
      message: `${stableId} is named '${existing.name}' and '${normalizedName}' across supplied overlays.`,
    });
  }
  people.set(stableId, {
    ...existing,
    stableId,
    name: existing?.name ?? normalizedName,
    provenance: existing?.provenance ?? provenance,
  });
}

function setBuilding(buildings, stableId, patch) {
  const existing = buildings.get(stableId);
  if (!existing) throw new Error(`Unknown mapped building ${stableId}.`);
  buildings.set(stableId, {
    ...existing,
    district: patch.district ?? existing.district,
    name: patch.name ?? existing.name,
    address: patch.address ?? existing.address,
    census: patch.census ?? existing.census,
    provenance: patch.provenance ?? existing.provenance,
  });
}

const [
  promptText,
  roadText,
  mapIndexText,
  workbookSheets,
  residentsCurrentText,
  buildingsCurrentText,
  residentsWorkforceText,
  buildingsWorkforceText,
  householdsWorkforceText,
  householdRelationshipsText,
  workplaceStaffText,
  establishmentsStaffedText,
  familyEmploymentLinksText,
  groupQuartersWorkforceText,
  workforceSummaryText,
] = await Promise.all([
  readFile(path.join(projectRoot, sourceFiles.prompts), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.roads), "utf8"),
  readFile(mapIndexPath, "utf8"),
  readXlsxFile(path.join(projectRoot, sourceFiles.factions)),
  readFile(path.join(projectRoot, sourceFiles.residentsCurrent), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.buildingsCurrent), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.residentsWorkforce), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.buildingsWorkforce), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.householdsWorkforce), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.householdRelationships), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.workplaceStaff), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.establishmentsStaffed), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.familyEmploymentLinks), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.groupQuartersWorkforce), "utf8"),
  readFile(path.join(projectRoot, sourceFiles.workforceSummary), "utf8"),
]);

const promptRows = recordsFromRows(parseCsv(promptText));
const roadRows = recordsFromRows(parseCsv(roadText));
const mapIndex = JSON.parse(mapIndexText);
const sheetMap = new Map(workbookSheets.map((sheet) => [sheet.sheet, sheet.data]));
const residentsCurrentRows = recordsFromRows(parseCsv(residentsCurrentText));
const buildingsCurrentRows = recordsFromRows(parseCsv(buildingsCurrentText));
const residentsWorkforceRows = recordsFromRows(parseCsv(residentsWorkforceText));
const buildingsWorkforceRows = recordsFromRows(parseCsv(buildingsWorkforceText));
const householdsWorkforceRows = recordsFromRows(parseCsv(householdsWorkforceText));
const householdRelationshipRows = recordsFromRows(parseCsv(householdRelationshipsText));
const workplaceStaffRows = recordsFromRows(parseCsv(workplaceStaffText));
const establishmentRows = recordsFromRows(parseCsv(establishmentsStaffedText));
const familyEmploymentRows = recordsFromRows(parseCsv(familyEmploymentLinksText));
const groupQuarterRows = recordsFromRows(parseCsv(groupQuartersWorkforceText));
const workforceSummaryRows = recordsFromRows(parseCsv(workforceSummaryText));

const sheetRecords = (name, headerIndex = 0) => {
  const rows = sheetMap.get(name);
  if (!rows) throw new Error(`Workbook sheet '${name}' is missing.`);
  return recordsFromRows(rows, headerIndex);
};

const factionRows = sheetRecords("Factions");
const keyPeopleRows = sheetRecords("Key People");
const locationRows = sheetRecords("Locations");
const membershipRows = sheetRecords("Faction Members");
const relationshipRows = sheetRecords("Relationships");
const infrastructureRows = sheetRecords("Infrastructure");
const atmosphereRows = sheetRecords("District Atmosphere v21", 1);

assertUnique(mapIndex.buildings, (record) => record.stableId, "Map index");
assertUnique(promptRows, (record) => `${record.value.District}:${record.value.Prompt_Number}`, "Prompt CSV");
assertUnique(roadRows, (record) => record.value.Road_ID, "Road CSV");
assertUnique(factionRows, (record) => record.value["Faction ID"], "Factions sheet");
assertUnique(locationRows, (record) => record.value["AR ID"], "Locations sheet");
assertUnique(residentsCurrentRows, (record) => record.value.Person_ID, "Current resident census");
assertUnique(buildingsCurrentRows, (record) => record.value.AR_ID, "Current building census");
assertUnique(householdsWorkforceRows, (record) => record.value.Household_ID, "Household census");
assertUnique(groupQuarterRows, (record) => record.value.Group_Quarter_ID, "Group-quarter census");
assertUnique(establishmentRows, (record) => record.value.AR_ID, "Establishment census");
assertUnique(
  workplaceStaffRows,
  (record) => `${record.value.Workplace_AR_ID}:${record.value.Person_ID}`,
  "Workplace staff census",
);
assertUnique(
  membershipRows,
  (record) => `${record.value["Faction ID"]}:${record.value["Person ID"]}`,
  "Faction Members sheet",
);

if (mapIndex.count !== 1676 || mapIndex.fallbackCount !== 0) {
  throw new Error(
    `Map index must contain 1,676 unambiguous mappings; found ${mapIndex.count} with ${mapIndex.fallbackCount} fallbacks.`,
  );
}

const expectedSourceCounts = [
  ["current resident census", residentsCurrentRows.length, 10000],
  ["current building census", buildingsCurrentRows.length, 1676],
  ["v19 resident workforce", residentsWorkforceRows.length, 10000],
  ["v19 building workforce", buildingsWorkforceRows.length, 1676],
  ["households", householdsWorkforceRows.length, 1576],
  ["household relationships", householdRelationshipRows.length, 6004],
  ["workplace staff", workplaceStaffRows.length, 3839],
  ["establishments", establishmentRows.length, 721],
  ["family employment links", familyEmploymentRows.length, 205],
  ["group quarters", groupQuarterRows.length, 432],
];
for (const [label, actual, expected] of expectedSourceCounts) {
  if (actual !== expected) throw new Error(`Expected ${expected} ${label} rows; found ${actual}.`);
}

const currentResidentIds = new Set(residentsCurrentRows.map((record) => record.value.Person_ID));
const workforceResidentIds = new Set(residentsWorkforceRows.map((record) => record.value.Person_ID));
const currentBuildingIds = new Set(buildingsCurrentRows.map((record) => record.value.AR_ID));
const workforceBuildingIds = new Set(buildingsWorkforceRows.map((record) => record.value.AR_ID));
if (
  currentResidentIds.size !== workforceResidentIds.size ||
  [...currentResidentIds].some((stableId) => !workforceResidentIds.has(stableId))
) {
  throw new Error("The v20 resident IDs do not exactly match the v19 workforce resident IDs.");
}
if (
  currentBuildingIds.size !== workforceBuildingIds.size ||
  [...currentBuildingIds].some((stableId) => !workforceBuildingIds.has(stableId))
) {
  throw new Error("The v20 building IDs do not exactly match the v19 workforce building IDs.");
}
if (
  currentBuildingIds.size !== mapIndex.buildings.length ||
  mapIndex.buildings.some((building) => !currentBuildingIds.has(building.stableId))
) {
  throw new Error("The current building census does not exactly cover the 1,676 mapped building IDs.");
}

const issues = [];
const districts = new Map();
const buildings = new Map(
  mapIndex.buildings.map((building) => [
    building.stableId,
    {
      stableId: building.stableId,
      district: mapDistrictAliases.get(building.district) ?? building.district,
      mapDistrict: building.district,
      name: null,
      address: null,
      pathId: building.pathId,
      centroidX: building.centroid[0],
      centroidY: building.centroid[1],
      census: null,
      provenance: { sourceFile: sourceFiles.map, sourceRow: null },
    },
  ]),
);
const people = new Map();

for (const record of residentsCurrentRows) {
  const value = record.value;
  const stableId = String(value.Person_ID).trim();
  people.set(stableId, {
    stableId,
    name: String(value.Name ?? "").trim() || null,
    profile: value,
    provenance: { sourceFile: sourceFiles.residentsCurrent, sourceRow: record.sourceRow },
  });
}

for (const building of buildings.values()) {
  districts.set(building.district, {
    stableId: `DISTRICT:${slugify(building.district)}`,
    name: building.district,
    openingDescription: null,
  });
}

for (const record of atmosphereRows) {
  const name = String(record.value.District).trim();
  const existing = districts.get(name);
  if (!existing) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_DISTRICT",
      message: `Atmosphere row ${record.sourceRow} references unknown district '${name}'.`,
    });
    continue;
  }
  existing.openingDescription = String(record.value["Opening Description"] ?? "").trim() || null;
}

const prompts = promptRows.map((record) => {
  const value = record.value;
  const district = canonicalDistrict(String(value.District).trim());
  if (!districts.has(district)) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_PROMPT_DISTRICT",
      message: `Prompt row ${record.sourceRow} references unknown district '${district}'.`,
    });
  }

  const personIds = splitList(value.Person_IDs);
  const personNames = splitList(value.People);
  if (personIds.length !== personNames.length) {
    issues.push({
      severity: "error",
      code: "PROMPT_PERSON_COUNT",
      message: `Prompt row ${record.sourceRow} has ${personIds.length} person IDs and ${personNames.length} names.`,
    });
  }
  personIds.forEach((stableId, index) =>
    setPerson(
      people,
      stableId,
      personNames[index],
      { sourceFile: sourceFiles.prompts, sourceRow: record.sourceRow },
      issues,
    ),
  );

  const buildingIds = splitList(value.AR_IDs);
  const locationLabels = splitList(value.Locations);
  if (locationLabels.length > 0 && buildingIds.length !== locationLabels.length) {
    issues.push({
      severity: "error",
      code: "PROMPT_LOCATION_COUNT",
      message: `Prompt row ${record.sourceRow} has ${buildingIds.length} AR IDs and ${locationLabels.length} locations.`,
    });
  }
  buildingIds.forEach((stableId, index) => {
    if (!buildings.has(stableId)) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_PROMPT_BUILDING",
        message: `Prompt row ${record.sourceRow} references unknown building '${stableId}'.`,
      });
      return;
    }
    setBuilding(buildings, stableId, {
      ...parseLocationLabel(locationLabels[index]),
      provenance: { sourceFile: sourceFiles.prompts, sourceRow: record.sourceRow },
    });
  });

  return {
    stableId: `PROMPT:${slugify(district)}:${String(value.Prompt_Number).padStart(2, "0")}`,
    district,
    promptNumber: Number(value.Prompt_Number),
    promptType: String(value.Prompt_Type),
    bestTime: String(value.Best_Time),
    prompt: String(value.Prompt),
    dmConnection: String(value.DM_Connection),
    personIds,
    buildingIds,
    sourceRow: record.sourceRow,
    raw: value,
  };
});

for (const record of locationRows) {
  const value = record.value;
  const stableId = String(value["AR ID"]).trim();
  if (!buildings.has(stableId)) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_LOCATION_BUILDING",
      message: `Locations row ${record.sourceRow} references unknown building '${stableId}'.`,
    });
    continue;
  }
  setBuilding(buildings, stableId, {
    name: String(value["V20 Property / Site"] ?? "").trim() || null,
    address: String(value.Address ?? "").trim() || null,
    provenance: {
      sourceFile: sourceFiles.factions,
      sourceSheet: "Locations",
      sourceRow: record.sourceRow,
    },
  });
}

for (const record of buildingsCurrentRows) {
  const value = record.value;
  const stableId = String(value.AR_ID).trim();
  if (!buildings.has(stableId)) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_CENSUS_BUILDING",
      message: `Current building row ${record.sourceRow} references unmapped building '${stableId}'.`,
    });
    continue;
  }
  const district = canonicalDistrict(String(value.District).trim());
  if (!districts.has(district)) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_CENSUS_DISTRICT",
      message: `Current building row ${record.sourceRow} references unknown district '${district}'.`,
    });
  }
  setBuilding(buildings, stableId, {
    district,
    name: String(value.Property_Name ?? "").trim() || null,
    address: String(value.Full_Address ?? "").trim() || null,
    census: value,
    provenance: { sourceFile: sourceFiles.buildingsCurrent, sourceRow: record.sourceRow },
  });
}

const householdIds = new Set(householdsWorkforceRows.map((record) => record.value.Household_ID));
const groupQuarterIds = new Set(groupQuarterRows.map((record) => record.value.Group_Quarter_ID));
const addReferenceIssue = (code, message) => issues.push({ severity: "error", code, message });

for (const record of residentsCurrentRows) {
  const value = record.value;
  if (!buildings.has(value.AR_ID)) {
    addReferenceIssue(
      "UNKNOWN_RESIDENT_HOME",
      `Resident ${value.Person_ID} references unknown home building '${value.AR_ID}'.`,
    );
  }
  if (value.Work_AR_ID && !buildings.has(value.Work_AR_ID)) {
    addReferenceIssue(
      "UNKNOWN_RESIDENT_WORKPLACE",
      `Resident ${value.Person_ID} references unknown workplace '${value.Work_AR_ID}'.`,
    );
  }
  if (value.Residence_Type === "Household" && !householdIds.has(value.Residence_Unit_ID)) {
    addReferenceIssue(
      "UNKNOWN_RESIDENT_HOUSEHOLD",
      `Resident ${value.Person_ID} references unknown household '${value.Residence_Unit_ID}'.`,
    );
  }
  if (value.Residence_Type === "Group quarters" && !groupQuarterIds.has(value.Residence_Unit_ID)) {
    addReferenceIssue(
      "UNKNOWN_RESIDENT_GROUP_QUARTER",
      `Resident ${value.Person_ID} references unknown group quarter '${value.Residence_Unit_ID}'.`,
    );
  }
}

for (const record of householdRelationshipRows) {
  const value = record.value;
  if (!householdIds.has(value.Household_ID)) {
    addReferenceIssue("UNKNOWN_RELATIONSHIP_HOUSEHOLD", `Relationship row ${record.sourceRow} has unknown household.`);
  }
  for (const personId of [value.Person_A_ID, value.Person_B_ID]) {
    if (!currentResidentIds.has(personId)) {
      addReferenceIssue(
        "UNKNOWN_RELATIONSHIP_PERSON",
        `Relationship row ${record.sourceRow} references unknown person '${personId}'.`,
      );
    }
  }
}

for (const record of workplaceStaffRows) {
  const value = record.value;
  if (!buildings.has(value.Workplace_AR_ID) || !currentResidentIds.has(value.Person_ID)) {
    addReferenceIssue(
      "UNKNOWN_WORKPLACE_STAFF_REFERENCE",
      `Workplace staff row ${record.sourceRow} has an unknown person or building reference.`,
    );
  }
}

for (const record of establishmentRows) {
  const value = record.value;
  if (!buildings.has(value.AR_ID) || !currentResidentIds.has(value.Lead_Person_ID)) {
    addReferenceIssue(
      "UNKNOWN_ESTABLISHMENT_REFERENCE",
      `Establishment row ${record.sourceRow} has an unknown lead or building reference.`,
    );
  }
}

for (const record of householdsWorkforceRows) {
  const value = record.value;
  if (!buildings.has(value.AR_ID) || !currentResidentIds.has(value.Lead_Person_ID)) {
    addReferenceIssue(
      "UNKNOWN_HOUSEHOLD_REFERENCE",
      `Household row ${record.sourceRow} has an unknown lead or building reference.`,
    );
  }
}

for (const record of groupQuarterRows) {
  if (!buildings.has(record.value.AR_ID)) {
    addReferenceIssue(
      "UNKNOWN_GROUP_QUARTER_BUILDING",
      `Group-quarter row ${record.sourceRow} references unknown building '${record.value.AR_ID}'.`,
    );
  }
}

for (const record of familyEmploymentRows) {
  const value = record.value;
  if (
    !buildings.has(value.Workplace_AR_ID) ||
    !currentResidentIds.has(value.Lead_Person_ID) ||
    !currentResidentIds.has(value.Family_Employee_Person_ID) ||
    !householdIds.has(value.Shared_Household_ID)
  ) {
    addReferenceIssue(
      "UNKNOWN_FAMILY_EMPLOYMENT_REFERENCE",
      `Family employment row ${record.sourceRow} has an unknown relationship reference.`,
    );
  }
}

for (const record of membershipRows) {
  setPerson(
    people,
    String(record.value["Person ID"]).trim(),
    record.value.Name,
    { sourceFile: sourceFiles.factions, sourceSheet: "Faction Members", sourceRow: record.sourceRow },
    issues,
  );
}

for (const record of keyPeopleRows) {
  setPerson(
    people,
    String(record.value["Person ID"]).trim(),
    record.value["Canonical Name"],
    { sourceFile: sourceFiles.factions, sourceSheet: "Key People", sourceRow: record.sourceRow },
    issues,
  );
}

const roads = roadRows.map((record) => {
  const value = record.value;
  const markerX = Number(value.Marker_X);
  const markerY = Number(value.Marker_Y);
  if (markerX < 0 || markerX > 2042.02 || markerY < 0 || markerY > 1993.07) {
    issues.push({
      severity: "error",
      code: "ROAD_MARKER_BOUNDS",
      message: `Road ${value.Road_ID} marker lies outside the SVG viewBox.`,
    });
  }
  return {
    stableId: String(value.Road_ID),
    name: String(value.Road_Name),
    nameSource: String(value.Name_Source),
    previousReviewLabel: String(value.Previous_Review_Label),
    markerX,
    markerY,
    generationZone: String(value.Generation_Zone),
    sourceRow: record.sourceRow,
    raw: value,
  };
});

const factions = factionRows.map((record) => ({
  stableId: String(record.value["Faction ID"]),
  name: String(record.value.Faction),
  type: String(record.value.Type),
  headquartersEntityId: String(record.value["HQ AR ID"] ?? "").trim() || null,
  leaderPersonId: String(record.value["Leader Person ID"] ?? "").trim() || null,
  publicFace: String(record.value["Public Face"] ?? ""),
  coreActivities: String(record.value["Core Activities"] ?? ""),
  useOfForce: String(record.value["Use of Force"] ?? ""),
  politicalRelationships: String(record.value["Political Relationships"] ?? ""),
  sourceRow: record.sourceRow,
  raw: record.value,
}));
const factionIds = new Set(factions.map((faction) => faction.stableId));
const censusMemberships = residentsCurrentRows.flatMap((record) => {
  const value = record.value;
  const roles = splitList(value.V20_Faction_Roles);
  return splitList(value.V20_Faction_IDs).map((factionId) => {
    const roleEntry = roles.find((role) => role.startsWith(`${factionId}:`));
    return {
      factionId,
      personId: String(value.Person_ID),
      role: roleEntry ? roleEntry.slice(factionId.length + 1).trim() : null,
    };
  });
});

for (const membership of censusMemberships) {
  if (!factionIds.has(membership.factionId)) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_CENSUS_FACTION",
      message: `${membership.personId} references unknown faction ${membership.factionId}.`,
    });
  }
}

const infrastructureIds = new Set(
  infrastructureRows.map((record) => String(record.value["Site ID"]).trim()),
);

for (const faction of factions) {
  if (
    faction.headquartersEntityId &&
    !buildings.has(faction.headquartersEntityId) &&
    !infrastructureIds.has(faction.headquartersEntityId)
  ) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_FACTION_HQ",
      message: `${faction.stableId} references unknown HQ ${faction.headquartersEntityId}.`,
    });
  }
  if (faction.leaderPersonId && !people.has(faction.leaderPersonId)) {
    issues.push({
      severity: "warning",
      code: "PARTIAL_FACTION_LEADER",
      message: `${faction.stableId} leader ${faction.leaderPersonId} is not present in the supplied people overlays.`,
    });
  }
}

const workforceMetrics = new Map(
  workforceSummaryRows.map((record) => [String(record.value.Metric), Number(record.value.Count)]),
);
for (const [metric, actual] of [
  ["Permanent residents", residentsCurrentRows.length],
  ["Mapped establishments", establishmentRows.length],
  ["Total people attached to mapped workplaces", workplaceStaffRows.length],
  ["Explicit household relationship edges", householdRelationshipRows.length],
]) {
  if (workforceMetrics.get(metric) !== actual) {
    issues.push({
      severity: "error",
      code: "WORKFORCE_SUMMARY_MISMATCH",
      message: `${metric} reports ${workforceMetrics.get(metric)} but the imported rows total ${actual}.`,
    });
  }
}

const summary = {
  mapBuildings: buildings.size,
  namedBuildings: [...buildings.values()].filter((building) => building.name).length,
  people: people.size,
  factions: factions.length,
  memberships: membershipRows.length,
  prompts: prompts.length,
  roads: roads.length,
  locationOverlays: locationRows.length,
  relationships: relationshipRows.length,
  infrastructure: infrastructureRows.length,
  districts: districts.size,
  households: householdsWorkforceRows.length,
  householdRelationships: householdRelationshipRows.length,
  groupQuarters: groupQuarterRows.length,
  establishments: establishmentRows.length,
  workplaceStaff: workplaceStaffRows.length,
  familyEmploymentLinks: familyEmploymentRows.length,
  censusMemberships: censusMemberships.length,
};

const fatalIssues = issues.filter((issue) => issue.severity === "error");
if (fatalIssues.length > 0) {
  console.error(JSON.stringify({ status: "failed", summary, issues }, null, 2));
  process.exitCode = 1;
} else if (dryRun) {
  console.log(JSON.stringify({ status: "valid", dryRun: true, summary, issues }, null, 2));
} else {
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(backupsDirectory, { recursive: true });
  await mkdir(reportsDirectory, { recursive: true });

  let backupPath = null;
  try {
    await stat(databasePath);
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    backupPath = path.join(backupsDirectory, `arentoria-before-${timestamp}.sqlite`);
    await copyFile(databasePath, backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS import_run (
      id INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      backup_path TEXT
    );

    CREATE TABLE IF NOT EXISTS source_snapshot (
      import_run_id INTEGER NOT NULL REFERENCES import_run(id),
      source_file TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      PRIMARY KEY (import_run_id, source_file)
    );

    CREATE TABLE IF NOT EXISTS source_record (
      source_file TEXT NOT NULL,
      source_sheet TEXT NOT NULL DEFAULT '',
      source_row INTEGER NOT NULL,
      record_key TEXT NOT NULL,
      entity_stable_id TEXT,
      source_hash TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      source_present INTEGER NOT NULL DEFAULT 1,
      last_import_run_id INTEGER NOT NULL REFERENCES import_run(id),
      PRIMARY KEY (source_file, source_sheet, source_row, record_key)
    );

    CREATE TABLE IF NOT EXISTS entity (
      id INTEGER PRIMARY KEY,
      stable_id TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      source_present INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS district (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      opening_description TEXT
    );

    CREATE TABLE IF NOT EXISTS building (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      district_name TEXT NOT NULL,
      name TEXT,
      address TEXT,
      svg_path_id TEXT NOT NULL UNIQUE,
      centroid_x REAL NOT NULL,
      centroid_y REAL NOT NULL,
      source_completeness TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS person (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      display_name TEXT,
      source_completeness TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resident_profile (
      person_id TEXT PRIMARY KEY,
      given_name TEXT,
      surname TEXT,
      age INTEGER,
      age_band TEXT,
      ancestry TEXT,
      ancestry_detail TEXT,
      heritage_marker TEXT,
      residence_type TEXT NOT NULL,
      residence_unit_id TEXT NOT NULL,
      household_role TEXT,
      home_building_id TEXT NOT NULL,
      home_address TEXT NOT NULL,
      home_district TEXT NOT NULL,
      origin_residency TEXT,
      wealth_class TEXT,
      occupation_daily_role TEXT,
      workplace_building_id TEXT,
      workplace_name TEXT,
      workplace_address TEXT,
      workplace_district TEXT,
      workplace_specific_use TEXT,
      workplace_role TEXT,
      workplace_standing TEXT,
      workplace_legality TEXT,
      commute_class TEXT,
      relationship_to_household_lead TEXT,
      household_lead_person_id TEXT,
      household_lead_name TEXT,
      faction_ids TEXT,
      faction_roles TEXT,
      canonical_role TEXT,
      civic_office_building_id TEXT,
      primary_faction_id TEXT,
      public_notes TEXT,
      private_pressure TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS building_census (
      building_id TEXT PRIMARY KEY,
      road_id TEXT,
      street_route TEXT,
      primary_land_use TEXT,
      specific_use TEXT,
      permanent_residents INTEGER NOT NULL,
      census_units INTEGER NOT NULL,
      household_units INTEGER NOT NULL,
      group_quarter_residents INTEGER NOT NULL,
      has_group_quarter INTEGER NOT NULL,
      resident_establishment_lead_count INTEGER NOT NULL,
      workplace_lead_person_id TEXT,
      workplace_lead_name TEXT,
      workplace_staff_count INTEGER NOT NULL,
      faction_ids TEXT,
      location_notes TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS household (
      stable_id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL,
      address TEXT NOT NULL,
      district TEXT NOT NULL,
      unit_index INTEGER,
      household_size INTEGER NOT NULL,
      wealth_class TEXT,
      lead_person_id TEXT NOT NULL,
      lead_name TEXT,
      household_type TEXT,
      ancestry_profile TEXT,
      mapped_workplaces TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS household_member (
      household_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      household_role TEXT,
      relationship_to_lead TEXT,
      household_lead_person_id TEXT,
      source_present INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (household_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS household_relationship (
      stable_id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      person_a_id TEXT NOT NULL,
      person_b_id TEXT NOT NULL,
      a_to_b_relationship TEXT NOT NULL,
      b_to_a_relationship TEXT NOT NULL,
      relationship_class TEXT,
      shared_address TEXT,
      generation_note TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS group_quarter (
      stable_id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL,
      address TEXT NOT NULL,
      district TEXT NOT NULL,
      property_name TEXT,
      group_quarter_type TEXT,
      resident_count INTEGER NOT NULL,
      wealth_class TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS group_quarter_member (
      group_quarter_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      household_role TEXT,
      source_present INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (group_quarter_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS workplace (
      building_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      district TEXT NOT NULL,
      specific_use TEXT,
      lead_person_id TEXT NOT NULL,
      lead_name TEXT,
      nonlead_staff_count INTEGER NOT NULL,
      total_staff_count INTEGER NOT NULL,
      family_employee_count INTEGER NOT NULL,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS workplace_staff (
      workplace_building_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      staff_role TEXT,
      staff_level TEXT,
      family_of_lead TEXT,
      relationship_to_lead TEXT,
      same_household_as_lead TEXT,
      commute_class TEXT,
      assignment_method TEXT,
      source_present INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (workplace_building_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS family_employment_link (
      workplace_building_id TEXT NOT NULL,
      lead_person_id TEXT NOT NULL,
      employee_person_id TEXT NOT NULL,
      relationship_to_lead TEXT,
      employee_role TEXT,
      shared_household_id TEXT,
      shared_home_address TEXT,
      source_present INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (workplace_building_id, lead_person_id, employee_person_id)
    );

    CREATE TABLE IF NOT EXISTS faction (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      faction_type TEXT,
      headquarters_entity_id TEXT,
      leader_person_id TEXT,
      public_face TEXT,
      core_activities TEXT,
      use_of_force TEXT,
      political_relationships TEXT
    );

    CREATE TABLE IF NOT EXISTS faction_membership (
      faction_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      faction_role TEXT,
      visibility TEXT,
      ancestry TEXT,
      detail TEXT,
      reptile_touched TEXT,
      home_address TEXT,
      home_district TEXT,
      day_job TEXT,
      workplace TEXT,
      notes TEXT,
      source_present INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (faction_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS district_prompt (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      district_name TEXT NOT NULL,
      prompt_number INTEGER NOT NULL,
      prompt_type TEXT NOT NULL,
      best_time TEXT,
      prompt_text TEXT NOT NULL,
      dm_connection TEXT,
      source_present INTEGER NOT NULL DEFAULT 1,
      UNIQUE (district_name, prompt_number)
    );

    CREATE TABLE IF NOT EXISTS prompt_entity_link (
      prompt_id TEXT NOT NULL,
      entity_stable_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      PRIMARY KEY (prompt_id, entity_stable_id, link_type)
    );

    CREATE TABLE IF NOT EXISTS road (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_source TEXT,
      previous_review_label TEXT,
      marker_x REAL NOT NULL,
      marker_y REAL NOT NULL,
      generation_zone TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS location_overlay (
      building_id TEXT PRIMARY KEY,
      district TEXT,
      land_use TEXT,
      specific_use TEXT,
      faction_ids TEXT,
      visibility TEXT,
      previous_name TEXT,
      previous_use TEXT,
      notes TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS relationship (
      stable_id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      notes TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS infrastructure (
      entity_id INTEGER PRIMARY KEY REFERENCES entity(id),
      stable_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      location TEXT,
      description TEXT,
      hook TEXT,
      source_present INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS app_note (
      id INTEGER PRIMARY KEY,
      entity_stable_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lore_record (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      canon_status TEXT NOT NULL,
      knowledge_level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lore_link (
      lore_record_id INTEGER NOT NULL REFERENCES lore_record(id),
      entity_stable_id TEXT NOT NULL,
      PRIMARY KEY (lore_record_id, entity_stable_id)
    );

    CREATE TABLE IF NOT EXISTS session_pin (
      entity_stable_id TEXT PRIMARY KEY,
      pinned_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recent_view (
      entity_stable_id TEXT PRIMARY KEY,
      viewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS story_profile (
      entity_stable_id TEXT PRIMARY KEY,
      demeanor TEXT,
      wants TEXT,
      knows TEXT,
      secret TEXT,
      current_problem TEXT,
      recent_event TEXT,
      memorable_detail TEXT,
      loyalties TEXT,
      dislikes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    DROP TABLE IF EXISTS search_index;
    CREATE VIRTUAL TABLE search_index USING fts5(
      stable_id,
      entity_type UNINDEXED,
      title,
      subtitle,
      body,
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '2 3 4'
    );
  `);

  const now = new Date().toISOString();
  const run = db
    .prepare(
      "INSERT INTO import_run (started_at, status, summary_json, backup_path) VALUES (?, 'running', ?, ?)",
    )
    .run(now, JSON.stringify(summary), backupPath ? path.relative(projectRoot, backupPath) : null);
  const importRunId = Number(run.lastInsertRowid);

  const upsertEntity = db.prepare(`
    INSERT INTO entity (stable_id, entity_type, source_present, updated_at)
    VALUES (@stableId, @entityType, 1, @updatedAt)
    ON CONFLICT(stable_id) DO UPDATE SET
      entity_type = excluded.entity_type,
      source_present = 1,
      updated_at = excluded.updated_at
  `);
  const entityId = db.prepare("SELECT id FROM entity WHERE stable_id = ?");
  const upsertSourceRecord = db.prepare(`
    INSERT INTO source_record (
      source_file, source_sheet, source_row, record_key, entity_stable_id,
      source_hash, raw_json, source_present, last_import_run_id
    ) VALUES (@sourceFile, @sourceSheet, @sourceRow, @recordKey, @entityStableId, @sourceHash, @rawJson, 1, @importRunId)
    ON CONFLICT(source_file, source_sheet, source_row, record_key) DO UPDATE SET
      entity_stable_id = excluded.entity_stable_id,
      source_hash = excluded.source_hash,
      raw_json = excluded.raw_json,
      source_present = 1,
      last_import_run_id = excluded.last_import_run_id
  `);

  const upsertEntityAndGetId = (stableId, entityType) => {
    upsertEntity.run({ stableId, entityType, updatedAt: now });
    return entityId.get(stableId).id;
  };
  const upsertResidentProfile = db.prepare(`
    INSERT INTO resident_profile (
      person_id, given_name, surname, age, age_band, ancestry, ancestry_detail,
      heritage_marker, residence_type, residence_unit_id, household_role,
      home_building_id, home_address, home_district, origin_residency, wealth_class,
      occupation_daily_role, workplace_building_id, workplace_name, workplace_address,
      workplace_district, workplace_specific_use, workplace_role, workplace_standing,
      workplace_legality, commute_class, relationship_to_household_lead,
      household_lead_person_id, household_lead_name, faction_ids, faction_roles,
      canonical_role, civic_office_building_id, primary_faction_id, public_notes,
      private_pressure, source_present
    ) VALUES (
      @personId, @givenName, @surname, @age, @ageBand, @ancestry, @ancestryDetail,
      @heritageMarker, @residenceType, @residenceUnitId, @householdRole,
      @homeBuildingId, @homeAddress, @homeDistrict, @originResidency, @wealthClass,
      @occupationDailyRole, @workplaceBuildingId, @workplaceName, @workplaceAddress,
      @workplaceDistrict, @workplaceSpecificUse, @workplaceRole, @workplaceStanding,
      @workplaceLegality, @commuteClass, @relationshipToHouseholdLead,
      @householdLeadPersonId, @householdLeadName, @factionIds, @factionRoles,
      @canonicalRole, @civicOfficeBuildingId, @primaryFactionId, @publicNotes,
      @privatePressure, 1
    )
    ON CONFLICT(person_id) DO UPDATE SET
      given_name = excluded.given_name,
      surname = excluded.surname,
      age = excluded.age,
      age_band = excluded.age_band,
      ancestry = excluded.ancestry,
      ancestry_detail = excluded.ancestry_detail,
      heritage_marker = excluded.heritage_marker,
      residence_type = excluded.residence_type,
      residence_unit_id = excluded.residence_unit_id,
      household_role = excluded.household_role,
      home_building_id = excluded.home_building_id,
      home_address = excluded.home_address,
      home_district = excluded.home_district,
      origin_residency = excluded.origin_residency,
      wealth_class = excluded.wealth_class,
      occupation_daily_role = excluded.occupation_daily_role,
      workplace_building_id = excluded.workplace_building_id,
      workplace_name = excluded.workplace_name,
      workplace_address = excluded.workplace_address,
      workplace_district = excluded.workplace_district,
      workplace_specific_use = excluded.workplace_specific_use,
      workplace_role = excluded.workplace_role,
      workplace_standing = excluded.workplace_standing,
      workplace_legality = excluded.workplace_legality,
      commute_class = excluded.commute_class,
      relationship_to_household_lead = excluded.relationship_to_household_lead,
      household_lead_person_id = excluded.household_lead_person_id,
      household_lead_name = excluded.household_lead_name,
      faction_ids = excluded.faction_ids,
      faction_roles = excluded.faction_roles,
      canonical_role = excluded.canonical_role,
      civic_office_building_id = excluded.civic_office_building_id,
      primary_faction_id = excluded.primary_faction_id,
      public_notes = excluded.public_notes,
      private_pressure = excluded.private_pressure,
      source_present = 1
  `);

  const transaction = db.transaction(() => {
    db.prepare("UPDATE entity SET source_present = 0").run();
    db.prepare("UPDATE source_record SET source_present = 0").run();
    db.prepare("UPDATE resident_profile SET source_present = 0").run();
    db.prepare("UPDATE building_census SET source_present = 0").run();
    db.prepare("UPDATE household SET source_present = 0").run();
    db.prepare("UPDATE household_member SET source_present = 0").run();
    db.prepare("UPDATE household_relationship SET source_present = 0").run();
    db.prepare("UPDATE group_quarter SET source_present = 0").run();
    db.prepare("UPDATE group_quarter_member SET source_present = 0").run();
    db.prepare("UPDATE workplace SET source_present = 0").run();
    db.prepare("UPDATE workplace_staff SET source_present = 0").run();
    db.prepare("UPDATE family_employment_link SET source_present = 0").run();
    db.prepare("UPDATE faction_membership SET source_present = 0").run();
    db.prepare("UPDATE district_prompt SET source_present = 0").run();
    db.prepare("UPDATE road SET source_present = 0").run();
    db.prepare("UPDATE location_overlay SET source_present = 0").run();
    db.prepare("UPDATE relationship SET source_present = 0").run();
    db.prepare("UPDATE infrastructure SET source_present = 0").run();

    for (const district of districts.values()) {
      const id = upsertEntityAndGetId(district.stableId, "district");
      db.prepare(`
        INSERT INTO district (entity_id, stable_id, name, opening_description)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(stable_id) DO UPDATE SET
          name = excluded.name,
          opening_description = excluded.opening_description
      `).run(id, district.stableId, district.name, district.openingDescription);
    }

    for (const building of buildings.values()) {
      const id = upsertEntityAndGetId(building.stableId, "building");
      db.prepare(`
        INSERT INTO building (
          entity_id, stable_id, district_name, name, address, svg_path_id,
          centroid_x, centroid_y, source_completeness
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stable_id) DO UPDATE SET
          district_name = excluded.district_name,
          name = excluded.name,
          address = excluded.address,
          svg_path_id = excluded.svg_path_id,
          centroid_x = excluded.centroid_x,
          centroid_y = excluded.centroid_y,
          source_completeness = excluded.source_completeness
      `).run(
        id,
        building.stableId,
        building.district,
        building.name,
        building.address,
        building.pathId,
        building.centroidX,
        building.centroidY,
        building.census ? "census-v20" : building.name ? "overlay" : "map-only",
      );
    }

    for (const record of buildingsCurrentRows) {
      const value = record.value;
      db.prepare(`
        INSERT INTO building_census (
          building_id, road_id, street_route, primary_land_use, specific_use,
          permanent_residents, census_units, household_units, group_quarter_residents,
          has_group_quarter, resident_establishment_lead_count, workplace_lead_person_id,
          workplace_lead_name, workplace_staff_count, faction_ids, location_notes, source_present
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(building_id) DO UPDATE SET
          road_id = excluded.road_id,
          street_route = excluded.street_route,
          primary_land_use = excluded.primary_land_use,
          specific_use = excluded.specific_use,
          permanent_residents = excluded.permanent_residents,
          census_units = excluded.census_units,
          household_units = excluded.household_units,
          group_quarter_residents = excluded.group_quarter_residents,
          has_group_quarter = excluded.has_group_quarter,
          resident_establishment_lead_count = excluded.resident_establishment_lead_count,
          workplace_lead_person_id = excluded.workplace_lead_person_id,
          workplace_lead_name = excluded.workplace_lead_name,
          workplace_staff_count = excluded.workplace_staff_count,
          faction_ids = excluded.faction_ids,
          location_notes = excluded.location_notes,
          source_present = 1
      `).run(
        value.AR_ID,
        value.Road_ID || null,
        value.Street_Route || null,
        value.Primary_Land_Use || null,
        value.Specific_Use || null,
        Number(value.Permanent_Residents),
        Number(value.Census_Units),
        Number(value.Household_Units),
        Number(value.Group_Quarter_Residents),
        value.Has_Group_Quarter === "Yes" ? 1 : 0,
        Number(value.Resident_Establishment_Lead_Count),
        value.Workplace_Lead_Person_ID || null,
        value.Workplace_Lead_Name || null,
        Number(value.Workplace_Staff_Count),
        value.V20_Faction_IDs || null,
        value.V20_Location_Notes || null,
      );
    }

    for (const person of people.values()) {
      const id = upsertEntityAndGetId(person.stableId, "person");
      db.prepare(`
        INSERT INTO person (entity_id, stable_id, display_name, source_completeness)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(stable_id) DO UPDATE SET
          display_name = excluded.display_name,
          source_completeness = excluded.source_completeness
      `).run(id, person.stableId, person.name, person.profile ? "census-v20" : "overlay");
    }

    for (const record of residentsCurrentRows) {
      const value = record.value;
      upsertResidentProfile.run({
        personId: value.Person_ID,
        givenName: value.Given_Name || null,
        surname: value.Surname || null,
        age: value.Age ? Number(value.Age) : null,
        ageBand: value.Age_Band || null,
        ancestry: value.Ancestry || null,
        ancestryDetail: value.Ancestry_Detail || null,
        heritageMarker: value.Heritage_Marker || null,
        residenceType: value.Residence_Type,
        residenceUnitId: value.Residence_Unit_ID,
        householdRole: value.Household_Role || null,
        homeBuildingId: value.AR_ID,
        homeAddress: value.Full_Address,
        homeDistrict: canonicalDistrict(value.District),
        originResidency: value.Origin_Residency || null,
        wealthClass: value.Wealth_Class || null,
        occupationDailyRole: value.Occupation_Daily_Role || null,
        workplaceBuildingId: value.Work_AR_ID || null,
        workplaceName: value.Workplace_Name || null,
        workplaceAddress: value.Work_Address || null,
        workplaceDistrict: value.Work_District ? canonicalDistrict(value.Work_District) : null,
        workplaceSpecificUse: value.Work_Specific_Use || null,
        workplaceRole: value.Work_Role || null,
        workplaceStanding: value.Work_Standing || null,
        workplaceLegality: value.Work_Legality || null,
        commuteClass: value.Commute_Class || null,
        relationshipToHouseholdLead: value.Relationship_to_Household_Lead || null,
        householdLeadPersonId: value.Household_Lead_Person_ID || null,
        householdLeadName: value.Household_Lead_Name || null,
        factionIds: value.V20_Faction_IDs || null,
        factionRoles: value.V20_Faction_Roles || null,
        canonicalRole: value.V20_Canonical_Role || null,
        civicOfficeBuildingId: value.V20_Civic_Office_AR_ID || null,
        primaryFactionId: value.V20_Primary_Faction_ID || null,
        publicNotes: value.V20_Public_Notes || null,
        privatePressure: value.V20_Private_Pressure || null,
      });
    }

    for (const faction of factions) {
      const id = upsertEntityAndGetId(faction.stableId, "faction");
      db.prepare(`
        INSERT INTO faction (
          entity_id, stable_id, name, faction_type, headquarters_entity_id,
          leader_person_id, public_face, core_activities, use_of_force, political_relationships
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stable_id) DO UPDATE SET
          name = excluded.name,
          faction_type = excluded.faction_type,
          headquarters_entity_id = excluded.headquarters_entity_id,
          leader_person_id = excluded.leader_person_id,
          public_face = excluded.public_face,
          core_activities = excluded.core_activities,
          use_of_force = excluded.use_of_force,
          political_relationships = excluded.political_relationships
      `).run(
        id,
        faction.stableId,
        faction.name,
        faction.type,
        faction.headquartersEntityId,
        faction.leaderPersonId,
        faction.publicFace,
        faction.coreActivities,
        faction.useOfForce,
        faction.politicalRelationships,
      );
    }

    for (const record of membershipRows) {
      const value = record.value;
      db.prepare(`
        INSERT INTO faction_membership (
          faction_id, person_id, faction_role, visibility, ancestry, detail,
          reptile_touched, home_address, home_district, day_job, workplace, notes, source_present
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(faction_id, person_id) DO UPDATE SET
          faction_role = excluded.faction_role,
          visibility = excluded.visibility,
          ancestry = excluded.ancestry,
          detail = excluded.detail,
          reptile_touched = excluded.reptile_touched,
          home_address = excluded.home_address,
          home_district = excluded.home_district,
          day_job = excluded.day_job,
          workplace = excluded.workplace,
          notes = excluded.notes,
          source_present = 1
      `).run(
        value["Faction ID"],
        value["Person ID"],
        value["Faction Role"],
        value.Visibility,
        value.Ancestry,
        value.Detail,
        value["Reptile-Touched"],
        value["Home Address"],
        value["Home District"],
        value["Day Job"],
        value.Workplace,
        value.Notes,
      );
    }

    for (const membership of censusMemberships) {
      db.prepare(`
        INSERT INTO faction_membership (faction_id, person_id, faction_role, source_present)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(faction_id, person_id) DO UPDATE SET
          faction_role = COALESCE(excluded.faction_role, faction_membership.faction_role),
          source_present = 1
      `).run(membership.factionId, membership.personId, membership.role);
    }

    const upsertHousehold = db.prepare(`
      INSERT INTO household (
        stable_id, building_id, address, district, unit_index, household_size,
        wealth_class, lead_person_id, lead_name, household_type, ancestry_profile,
        mapped_workplaces, source_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(stable_id) DO UPDATE SET
        building_id = excluded.building_id,
        address = excluded.address,
        district = excluded.district,
        unit_index = excluded.unit_index,
        household_size = excluded.household_size,
        wealth_class = excluded.wealth_class,
        lead_person_id = excluded.lead_person_id,
        lead_name = excluded.lead_name,
        household_type = excluded.household_type,
        ancestry_profile = excluded.ancestry_profile,
        mapped_workplaces = excluded.mapped_workplaces,
        source_present = 1
    `);
    for (const record of householdsWorkforceRows) {
      const value = record.value;
      upsertHousehold.run(
        value.Household_ID,
        value.AR_ID,
        value.Full_Address,
        canonicalDistrict(value.District),
        value.Unit_Index ? Number(value.Unit_Index) : null,
        Number(value.Household_Size),
        value.Wealth_Class || null,
        value.Lead_Person_ID,
        value.Lead_Name || null,
        value.Household_Type || null,
        value.Ancestry_Profile || null,
        value.Mapped_Workplaces || null,
      );
    }

    const upsertHouseholdMember = db.prepare(`
      INSERT INTO household_member (
        household_id, person_id, household_role, relationship_to_lead,
        household_lead_person_id, source_present
      ) VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(household_id, person_id) DO UPDATE SET
        household_role = excluded.household_role,
        relationship_to_lead = excluded.relationship_to_lead,
        household_lead_person_id = excluded.household_lead_person_id,
        source_present = 1
    `);
    const upsertGroupQuarterMember = db.prepare(`
      INSERT INTO group_quarter_member (group_quarter_id, person_id, household_role, source_present)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(group_quarter_id, person_id) DO UPDATE SET
        household_role = excluded.household_role,
        source_present = 1
    `);
    for (const record of residentsCurrentRows) {
      const value = record.value;
      if (value.Residence_Type === "Household") {
        upsertHouseholdMember.run(
          value.Residence_Unit_ID,
          value.Person_ID,
          value.Household_Role || null,
          value.Relationship_to_Household_Lead || null,
          value.Household_Lead_Person_ID || null,
        );
      } else if (value.Residence_Type === "Group quarters") {
        upsertGroupQuarterMember.run(
          value.Residence_Unit_ID,
          value.Person_ID,
          value.Household_Role || null,
        );
      }
    }

    const upsertHouseholdRelationship = db.prepare(`
      INSERT INTO household_relationship (
        stable_id, household_id, person_a_id, person_b_id, a_to_b_relationship,
        b_to_a_relationship, relationship_class, shared_address, generation_note,
        source_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(stable_id) DO UPDATE SET
        household_id = excluded.household_id,
        person_a_id = excluded.person_a_id,
        person_b_id = excluded.person_b_id,
        a_to_b_relationship = excluded.a_to_b_relationship,
        b_to_a_relationship = excluded.b_to_a_relationship,
        relationship_class = excluded.relationship_class,
        shared_address = excluded.shared_address,
        generation_note = excluded.generation_note,
        source_present = 1
    `);
    for (const record of householdRelationshipRows) {
      const value = record.value;
      const stableId = `HHREL:${value.Household_ID}:${value.Person_A_ID}:${value.Person_B_ID}`;
      upsertHouseholdRelationship.run(
        stableId,
        value.Household_ID,
        value.Person_A_ID,
        value.Person_B_ID,
        value.A_to_B_Relationship,
        value.B_to_A_Relationship,
        value.Relationship_Class || null,
        value.Shared_Address || null,
        value.Generation_Note || null,
      );
    }

    const upsertGroupQuarter = db.prepare(`
      INSERT INTO group_quarter (
        stable_id, building_id, address, district, property_name, group_quarter_type,
        resident_count, wealth_class, source_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(stable_id) DO UPDATE SET
        building_id = excluded.building_id,
        address = excluded.address,
        district = excluded.district,
        property_name = excluded.property_name,
        group_quarter_type = excluded.group_quarter_type,
        resident_count = excluded.resident_count,
        wealth_class = excluded.wealth_class,
        source_present = 1
    `);
    for (const record of groupQuarterRows) {
      const value = record.value;
      upsertGroupQuarter.run(
        value.Group_Quarter_ID,
        value.AR_ID,
        value.Full_Address,
        canonicalDistrict(value.District),
        value.Property_Name || null,
        value.Group_Quarter_Type || null,
        Number(value.Resident_Count),
        value.Wealth_Class || null,
      );
    }

    const upsertWorkplace = db.prepare(`
      INSERT INTO workplace (
        building_id, name, address, district, specific_use, lead_person_id,
        lead_name, nonlead_staff_count, total_staff_count, family_employee_count,
        source_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(building_id) DO UPDATE SET
        name = excluded.name,
        address = excluded.address,
        district = excluded.district,
        specific_use = excluded.specific_use,
        lead_person_id = excluded.lead_person_id,
        lead_name = excluded.lead_name,
        nonlead_staff_count = excluded.nonlead_staff_count,
        total_staff_count = excluded.total_staff_count,
        family_employee_count = excluded.family_employee_count,
        source_present = 1
    `);
    for (const record of establishmentRows) {
      const value = record.value;
      upsertWorkplace.run(
        value.AR_ID,
        value.Establishment_Name,
        value.Full_Address,
        canonicalDistrict(value.District),
        value.Specific_Use || null,
        value.Lead_Person_ID,
        value.Lead_Name || null,
        Number(value.Nonlead_Staff_Count),
        Number(value.Total_Workplace_Staff),
        Number(value.Family_Employee_Count),
      );
    }

    const upsertWorkplaceStaff = db.prepare(`
      INSERT INTO workplace_staff (
        workplace_building_id, person_id, staff_role, staff_level, family_of_lead,
        relationship_to_lead, same_household_as_lead, commute_class,
        assignment_method, source_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(workplace_building_id, person_id) DO UPDATE SET
        staff_role = excluded.staff_role,
        staff_level = excluded.staff_level,
        family_of_lead = excluded.family_of_lead,
        relationship_to_lead = excluded.relationship_to_lead,
        same_household_as_lead = excluded.same_household_as_lead,
        commute_class = excluded.commute_class,
        assignment_method = excluded.assignment_method,
        source_present = 1
    `);
    for (const record of workplaceStaffRows) {
      const value = record.value;
      upsertWorkplaceStaff.run(
        value.Workplace_AR_ID,
        value.Person_ID,
        value.Staff_Role || null,
        value.Staff_Level || null,
        value.Family_of_Lead || null,
        value.Relationship_to_Lead || null,
        value.Same_Household_as_Lead || null,
        value.Commute_Class || null,
        value.Assignment_Method || null,
      );
    }

    const upsertFamilyEmployment = db.prepare(`
      INSERT INTO family_employment_link (
        workplace_building_id, lead_person_id, employee_person_id,
        relationship_to_lead, employee_role, shared_household_id,
        shared_home_address, source_present
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(workplace_building_id, lead_person_id, employee_person_id) DO UPDATE SET
        relationship_to_lead = excluded.relationship_to_lead,
        employee_role = excluded.employee_role,
        shared_household_id = excluded.shared_household_id,
        shared_home_address = excluded.shared_home_address,
        source_present = 1
    `);
    for (const record of familyEmploymentRows) {
      const value = record.value;
      upsertFamilyEmployment.run(
        value.Workplace_AR_ID,
        value.Lead_Person_ID,
        value.Family_Employee_Person_ID,
        value.Relationship_to_Lead || null,
        value.Employee_Role || null,
        value.Shared_Household_ID || null,
        value.Shared_Home_Address || null,
      );
    }

    for (const prompt of prompts) {
      const id = upsertEntityAndGetId(prompt.stableId, "prompt");
      db.prepare(`
        INSERT INTO district_prompt (
          entity_id, stable_id, district_name, prompt_number, prompt_type,
          best_time, prompt_text, dm_connection, source_present
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(stable_id) DO UPDATE SET
          district_name = excluded.district_name,
          prompt_number = excluded.prompt_number,
          prompt_type = excluded.prompt_type,
          best_time = excluded.best_time,
          prompt_text = excluded.prompt_text,
          dm_connection = excluded.dm_connection,
          source_present = 1
      `).run(
        id,
        prompt.stableId,
        prompt.district,
        prompt.promptNumber,
        prompt.promptType,
        prompt.bestTime,
        prompt.prompt,
        prompt.dmConnection,
      );
      db.prepare("DELETE FROM prompt_entity_link WHERE prompt_id = ?").run(prompt.stableId);
      for (const personId of prompt.personIds) {
        db.prepare(
          "INSERT INTO prompt_entity_link (prompt_id, entity_stable_id, link_type) VALUES (?, ?, 'person')",
        ).run(prompt.stableId, personId);
      }
      for (const buildingId of prompt.buildingIds) {
        db.prepare(
          "INSERT INTO prompt_entity_link (prompt_id, entity_stable_id, link_type) VALUES (?, ?, 'building')",
        ).run(prompt.stableId, buildingId);
      }
    }

    for (const road of roads) {
      const id = upsertEntityAndGetId(road.stableId, "road");
      db.prepare(`
        INSERT INTO road (
          entity_id, stable_id, name, name_source, previous_review_label,
          marker_x, marker_y, generation_zone, source_present
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(stable_id) DO UPDATE SET
          name = excluded.name,
          name_source = excluded.name_source,
          previous_review_label = excluded.previous_review_label,
          marker_x = excluded.marker_x,
          marker_y = excluded.marker_y,
          generation_zone = excluded.generation_zone,
          source_present = 1
      `).run(
        id,
        road.stableId,
        road.name,
        road.nameSource,
        road.previousReviewLabel,
        road.markerX,
        road.markerY,
        road.generationZone,
      );
    }

    for (const record of locationRows) {
      const value = record.value;
      db.prepare(`
        INSERT INTO location_overlay (
          building_id, district, land_use, specific_use, faction_ids, visibility,
          previous_name, previous_use, notes, source_present
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(building_id) DO UPDATE SET
          district = excluded.district,
          land_use = excluded.land_use,
          specific_use = excluded.specific_use,
          faction_ids = excluded.faction_ids,
          visibility = excluded.visibility,
          previous_name = excluded.previous_name,
          previous_use = excluded.previous_use,
          notes = excluded.notes,
          source_present = 1
      `).run(
        value["AR ID"],
        value.District,
        value["Land Use"],
        value["Specific Use"],
        value["Faction IDs"],
        value.Visibility,
        value["Previous Name"],
        value["Previous Use"],
        value.Notes,
      );
    }

    relationshipRows.forEach((record, index) => {
      const value = record.value;
      const stableId = `REL:${String(index + 1).padStart(3, "0")}`;
      db.prepare(`
        INSERT INTO relationship (stable_id, from_id, to_id, relationship, notes, source_present)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(stable_id) DO UPDATE SET
          from_id = excluded.from_id,
          to_id = excluded.to_id,
          relationship = excluded.relationship,
          notes = excluded.notes,
          source_present = 1
      `).run(stableId, value.From, value.To, value.Relationship, value.Notes);
    });

    for (const record of infrastructureRows) {
      const value = record.value;
      const stableId = String(value["Site ID"]);
      const id = upsertEntityAndGetId(stableId, "infrastructure");
      db.prepare(`
        INSERT INTO infrastructure (
          entity_id, stable_id, name, location, description, hook, source_present
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(stable_id) DO UPDATE SET
          name = excluded.name,
          location = excluded.location,
          description = excluded.description,
          hook = excluded.hook,
          source_present = 1
      `).run(
        id,
        stableId,
        value["Site / Infrastructure"],
        value.Location,
        value.Description,
        value["Hook / Use"],
      );
    }

    const sourceRecordRows = [
      ...promptRows.map((record) => ({
        sourceFile: sourceFiles.prompts,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: `prompt:${record.value.District}:${record.value.Prompt_Number}`,
        entityStableId: `PROMPT:${slugify(record.value.District)}:${String(record.value.Prompt_Number).padStart(2, "0")}`,
        raw: record.value,
      })),
      ...roadRows.map((record) => ({
        sourceFile: sourceFiles.roads,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.Road_ID),
        entityStableId: String(record.value.Road_ID),
        raw: record.value,
      })),
      ...factionRows.map((record) => ({
        sourceFile: sourceFiles.factions,
        sourceSheet: "Factions",
        sourceRow: record.sourceRow,
        recordKey: String(record.value["Faction ID"]),
        entityStableId: String(record.value["Faction ID"]),
        raw: record.value,
      })),
      ...membershipRows.map((record) => ({
        sourceFile: sourceFiles.factions,
        sourceSheet: "Faction Members",
        sourceRow: record.sourceRow,
        recordKey: `${record.value["Faction ID"]}:${record.value["Person ID"]}`,
        entityStableId: String(record.value["Person ID"]),
        raw: record.value,
      })),
      ...locationRows.map((record) => ({
        sourceFile: sourceFiles.factions,
        sourceSheet: "Locations",
        sourceRow: record.sourceRow,
        recordKey: String(record.value["AR ID"]),
        entityStableId: String(record.value["AR ID"]),
        raw: record.value,
      })),
      ...residentsCurrentRows.map((record) => ({
        sourceFile: sourceFiles.residentsCurrent,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.Person_ID),
        entityStableId: String(record.value.Person_ID),
        raw: record.value,
      })),
      ...buildingsCurrentRows.map((record) => ({
        sourceFile: sourceFiles.buildingsCurrent,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.AR_ID),
        entityStableId: String(record.value.AR_ID),
        raw: record.value,
      })),
      ...residentsWorkforceRows.map((record) => ({
        sourceFile: sourceFiles.residentsWorkforce,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.Person_ID),
        entityStableId: String(record.value.Person_ID),
        raw: record.value,
      })),
      ...buildingsWorkforceRows.map((record) => ({
        sourceFile: sourceFiles.buildingsWorkforce,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.AR_ID),
        entityStableId: String(record.value.AR_ID),
        raw: record.value,
      })),
      ...householdsWorkforceRows.map((record) => ({
        sourceFile: sourceFiles.householdsWorkforce,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.Household_ID),
        entityStableId: String(record.value.Household_ID),
        raw: record.value,
      })),
      ...householdRelationshipRows.map((record) => ({
        sourceFile: sourceFiles.householdRelationships,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: `${record.value.Household_ID}:${record.value.Person_A_ID}:${record.value.Person_B_ID}`,
        entityStableId: String(record.value.Household_ID),
        raw: record.value,
      })),
      ...workplaceStaffRows.map((record) => ({
        sourceFile: sourceFiles.workplaceStaff,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: `${record.value.Workplace_AR_ID}:${record.value.Person_ID}`,
        entityStableId: String(record.value.Person_ID),
        raw: record.value,
      })),
      ...establishmentRows.map((record) => ({
        sourceFile: sourceFiles.establishmentsStaffed,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.AR_ID),
        entityStableId: String(record.value.AR_ID),
        raw: record.value,
      })),
      ...familyEmploymentRows.map((record) => ({
        sourceFile: sourceFiles.familyEmploymentLinks,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: `${record.value.Workplace_AR_ID}:${record.value.Lead_Person_ID}:${record.value.Family_Employee_Person_ID}`,
        entityStableId: String(record.value.Family_Employee_Person_ID),
        raw: record.value,
      })),
      ...groupQuarterRows.map((record) => ({
        sourceFile: sourceFiles.groupQuartersWorkforce,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.Group_Quarter_ID),
        entityStableId: String(record.value.Group_Quarter_ID),
        raw: record.value,
      })),
      ...workforceSummaryRows.map((record) => ({
        sourceFile: sourceFiles.workforceSummary,
        sourceSheet: "",
        sourceRow: record.sourceRow,
        recordKey: String(record.value.Metric),
        entityStableId: null,
        raw: record.value,
      })),
    ];

    for (const sourceRecord of sourceRecordRows) {
      upsertSourceRecord.run({
        ...sourceRecord,
        sourceHash: rowHash(sourceRecord.raw),
        rawJson: JSON.stringify(sourceRecord.raw),
        importRunId,
      });
    }

    db.prepare("DELETE FROM search_index").run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT b.stable_id, 'building', COALESCE(b.name, b.stable_id),
             COALESCE(b.address, b.district_name),
             b.district_name || ' ' || COALESCE(bc.primary_land_use, '') || ' ' ||
             COALESCE(bc.specific_use, '') || ' ' || COALESCE(w.name, '')
      FROM building b
      LEFT JOIN building_census bc ON bc.building_id = b.stable_id AND bc.source_present = 1
      LEFT JOIN workplace w ON w.building_id = b.stable_id AND w.source_present = 1
    `).run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT p.stable_id, 'person', COALESCE(p.display_name, p.stable_id),
             COALESCE(rp.occupation_daily_role, p.stable_id),
             COALESCE(rp.ancestry, '') || ' ' || COALESCE(rp.home_address, '') || ' ' ||
             COALESCE(rp.workplace_name, '') || ' ' || COALESCE(rp.workplace_role, '') || ' ' ||
             COALESCE(rp.faction_ids, '') || ' ' ||
             COALESCE((SELECT group_concat(fm.day_job || ' ' || fm.workplace, ' ')
                       FROM faction_membership fm WHERE fm.person_id = p.stable_id), '')
      FROM person p
      LEFT JOIN resident_profile rp ON rp.person_id = p.stable_id AND rp.source_present = 1
    `).run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT stable_id, 'faction', name, faction_type,
             COALESCE(public_face, '') || ' ' || COALESCE(core_activities, '')
      FROM faction
    `).run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT stable_id, 'road', name, stable_id,
             COALESCE(previous_review_label, '') || ' ' || COALESCE(generation_zone, '')
      FROM road
    `).run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT stable_id, 'prompt', prompt_type, district_name || ' · ' || COALESCE(best_time, ''),
             prompt_text || ' ' || COALESCE(dm_connection, '')
      FROM district_prompt
      WHERE source_present = 1
    `).run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT stable_id, 'district', name, 'District', COALESCE(opening_description, '')
      FROM district
    `).run();
    db.prepare(`
      INSERT INTO search_index (stable_id, entity_type, title, subtitle, body)
      SELECT stable_id, 'infrastructure', name, COALESCE(location, stable_id),
             COALESCE(description, '') || ' ' || COALESCE(hook, '')
      FROM infrastructure
      WHERE source_present = 1
    `).run();

    db.prepare(
      "UPDATE import_run SET completed_at = ?, status = 'completed', summary_json = ? WHERE id = ?",
    ).run(new Date().toISOString(), JSON.stringify(summary), importRunId);
  });

  try {
    transaction();

    for (const sourceFile of Object.values(sourceFiles)) {
      const fullPath = path.join(projectRoot, sourceFile);
      const contents = await readFile(fullPath);
      db.prepare(`
        INSERT INTO source_snapshot (import_run_id, source_file, content_hash, byte_size)
        VALUES (?, ?, ?, ?)
      `).run(importRunId, sourceFile, hash(contents), contents.byteLength);
    }
  } catch (error) {
    db.prepare("UPDATE import_run SET completed_at = ?, status = 'failed' WHERE id = ?").run(
      new Date().toISOString(),
      importRunId,
    );
    throw error;
  } finally {
    db.close();
  }

  const report = {
    status: "imported",
    dryRun: false,
    importedAt: new Date().toISOString(),
    database: path.relative(projectRoot, databasePath),
    backup: backupPath ? path.relative(projectRoot, backupPath) : null,
    summary,
    issues,
  };
  const reportName = `import-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.json`;
  await writeFile(path.join(reportsDirectory, reportName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}
