import "server-only";

import { getDatabase } from "@/lib/db/client";
import { buildPersonConnections, type ConnectionCandidate } from "@/lib/connections";
import {
  firstSentence,
  naturalList,
  projectBuildingNarrative,
  projectPersonNarrative,
} from "@/lib/narrative";
import { normalizeSearchQuery } from "@/lib/search";
import { categorizePlaceType, placeCategoryDefinitions } from "@/lib/place-taxonomy";
import type {
  AtTableCue,
  DashboardSnapshot,
  EntityDetail,
  EntityKind,
  EntityLink,
  PlaceCategorySummary,
  PlaceSearchResult,
  SearchResult,
  StoryProfile,
} from "@/lib/types";

type SqlRow = Record<string, string | number | null>;

function present<T>(value: T | null): value is T {
  return value !== null;
}

const exteriorCanonical = "Outside the Walls / Farm Approaches";
const exteriorMap = "Unassigned Exterior";

const mapDistrictName = (district: string) =>
  district === exteriorCanonical ? exteriorMap : district;

function entitySummary(stableId: string): EntityLink | null {
  const { sqlite } = getDatabase();
  const entity = sqlite
    .prepare("SELECT entity_type FROM entity WHERE stable_id = ? AND source_present = 1")
    .get(stableId) as { entity_type: EntityKind } | undefined;
  if (!entity) return null;

  if (entity.entity_type === "building") {
    const row = sqlite
      .prepare("SELECT stable_id, name, address, district_name FROM building WHERE stable_id = ?")
      .get(stableId) as SqlRow;
    return {
      stableId,
      kind: "building",
      label: String(row.name ?? row.stable_id),
      detail: String(row.address ?? row.district_name),
    };
  }
  if (entity.entity_type === "person") {
    const row = sqlite
      .prepare(`
        SELECT p.stable_id, p.display_name, rp.occupation_daily_role
        FROM person p
        LEFT JOIN resident_profile rp ON rp.person_id = p.stable_id AND rp.source_present = 1
        WHERE p.stable_id = ?
      `)
      .get(stableId) as SqlRow;
    return {
      stableId,
      kind: "person",
      label: String(row.display_name ?? row.stable_id),
      detail: row.occupation_daily_role ? String(row.occupation_daily_role) : stableId,
    };
  }
  if (entity.entity_type === "faction") {
    const row = sqlite
      .prepare("SELECT stable_id, name, faction_type FROM faction WHERE stable_id = ?")
      .get(stableId) as SqlRow;
    return {
      stableId,
      kind: "faction",
      label: String(row.name),
      detail: String(row.faction_type ?? "Faction"),
    };
  }
  if (entity.entity_type === "road") {
    const row = sqlite.prepare("SELECT stable_id, name FROM road WHERE stable_id = ?").get(stableId) as SqlRow;
    return { stableId, kind: "road", label: String(row.name), detail: stableId };
  }
  if (entity.entity_type === "prompt") {
    const row = sqlite
      .prepare("SELECT stable_id, prompt_type, district_name FROM district_prompt WHERE stable_id = ?")
      .get(stableId) as SqlRow;
    return {
      stableId,
      kind: "prompt",
      label: String(row.prompt_type),
      detail: String(row.district_name),
    };
  }
  if (entity.entity_type === "infrastructure") {
    const row = sqlite
      .prepare("SELECT stable_id, name, location FROM infrastructure WHERE stable_id = ?")
      .get(stableId) as SqlRow;
    return {
      stableId,
      kind: "infrastructure",
      label: String(row.name),
      detail: String(row.location ?? stableId),
    };
  }
  const row = sqlite.prepare("SELECT stable_id, name FROM district WHERE stable_id = ?").get(stableId) as SqlRow;
  return { stableId, kind: "district", label: String(row.name), detail: "District" };
}

function promptRowsForEntity(stableId: string) {
  const { sqlite } = getDatabase();
  return sqlite
    .prepare(`
      SELECT p.stable_id, p.prompt_type, p.best_time, p.prompt_text, p.dm_connection
      FROM district_prompt p
      JOIN prompt_entity_link link ON link.prompt_id = p.stable_id
      WHERE link.entity_stable_id = ? AND p.source_present = 1
      ORDER BY p.district_name, p.prompt_number
    `)
    .all(stableId) as Array<{
    stable_id: string;
    prompt_type: string;
    best_time: string | null;
    prompt_text: string;
    dm_connection: string | null;
  }>;
}

function formatPrompts(rows: ReturnType<typeof promptRowsForEntity>) {
  return rows.map((row) => ({
    stableId: row.stable_id,
    type: row.prompt_type,
    bestTime: row.best_time,
    text: row.prompt_text,
    dmConnection: row.dm_connection,
  }));
}

const emptyStoryProfile: StoryProfile = {
  demeanor: null,
  wants: null,
  knows: null,
  secret: null,
  currentProblem: null,
  recentEvent: null,
  memorableDetail: null,
  loyalties: null,
  dislikes: null,
};

function storyProfileForEntity(stableId: string): StoryProfile {
  const { sqlite } = getDatabase();
  const row = sqlite
    .prepare(`
      SELECT demeanor, wants, knows, secret, current_problem, recent_event,
             memorable_detail, loyalties, dislikes
      FROM story_profile
      WHERE entity_stable_id = ?
    `)
    .get(stableId) as SqlRow | undefined;
  if (!row) return { ...emptyStoryProfile };
  return {
    demeanor: row.demeanor ? String(row.demeanor) : null,
    wants: row.wants ? String(row.wants) : null,
    knows: row.knows ? String(row.knows) : null,
    secret: row.secret ? String(row.secret) : null,
    currentProblem: row.current_problem ? String(row.current_problem) : null,
    recentEvent: row.recent_event ? String(row.recent_event) : null,
    memorableDetail: row.memorable_detail ? String(row.memorable_detail) : null,
    loyalties: row.loyalties ? String(row.loyalties) : null,
    dislikes: row.dislikes ? String(row.dislikes) : null,
  };
}

function storySituation(story: StoryProfile) {
  return [story.currentProblem, story.recentEvent].filter(Boolean).join(" ") || null;
}

function dmStoryCues(story: StoryProfile): AtTableCue[] {
  return [
    story.demeanor ? { label: "At the door", value: story.demeanor, source: "dm" as const } : null,
    story.wants ? { label: "Wants", value: story.wants, source: "dm" as const } : null,
    story.knows ? { label: "Knows", value: story.knows, source: "dm" as const } : null,
    story.loyalties ? { label: "Loyalties", value: story.loyalties, source: "dm" as const } : null,
    story.dislikes ? { label: "Dislikes", value: story.dislikes, source: "dm" as const } : null,
    story.memorableDetail
      ? { label: "Memorable detail", value: story.memorableDetail, source: "dm" as const }
      : null,
    story.secret ? { label: "Secret · DM only", value: story.secret, source: "dm" as const } : null,
  ].filter(present);
}

function splitStoredIds(value: string | number | null) {
  return String(value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getEntityDetail(stableId: string): EntityDetail | null {
  const { sqlite } = getDatabase();
  const entity = sqlite
    .prepare("SELECT entity_type FROM entity WHERE stable_id = ? AND source_present = 1")
    .get(stableId) as { entity_type: EntityKind } | undefined;
  if (!entity) return null;

  if (entity.entity_type === "building") {
    const building = sqlite
      .prepare(`
        SELECT b.*,
               COALESCE(l.land_use, bc.primary_land_use) AS land_use,
               COALESCE(l.specific_use, bc.specific_use) AS specific_use,
               l.visibility, l.notes,
               bc.road_id, bc.permanent_residents, bc.household_units,
               bc.group_quarter_residents, bc.workplace_staff_count,
               bc.workplace_lead_person_id, bc.workplace_lead_name,
               COALESCE(l.faction_ids, bc.faction_ids) AS faction_ids, bc.location_notes,
               w.name AS workplace_name, w.specific_use AS workplace_specific_use,
               w.total_staff_count, w.family_employee_count
        FROM building b
        LEFT JOIN location_overlay l ON l.building_id = b.stable_id AND l.source_present = 1
        LEFT JOIN building_census bc ON bc.building_id = b.stable_id AND bc.source_present = 1
        LEFT JOIN workplace w ON w.building_id = b.stable_id AND w.source_present = 1
        WHERE b.stable_id = ?
      `)
      .get(stableId) as SqlRow;
    const promptRows = promptRowsForEntity(stableId);
    const relatedIds = sqlite
      .prepare(`
        SELECT DISTINCT link.entity_stable_id
        FROM prompt_entity_link link
        WHERE link.prompt_id IN (
          SELECT prompt_id FROM prompt_entity_link
          WHERE entity_stable_id = ? AND link_type = 'building'
        ) AND link.entity_stable_id <> ?
      `)
      .all(stableId, stableId) as Array<{ entity_stable_id: string }>;
    const related: EntityLink[] = relatedIds
      .map((row) => entitySummary(row.entity_stable_id))
      .filter((item): item is EntityLink => Boolean(item));
    const addRelated = (item: EntityLink | null) => {
      if (item && !related.some((existing) => existing.stableId === item.stableId)) related.push(item);
    };
    const associatedPeople = sqlite
      .prepare(`
        SELECT p.stable_id, p.display_name,
               CASE
                 WHEN rp.home_building_id = ? AND ws.person_id IS NOT NULL THEN 'Resident · workplace staff'
                 WHEN rp.home_building_id = ? THEN 'Resident'
                 ELSE COALESCE(ws.staff_role, 'Workplace staff')
               END AS connection
        FROM person p
        LEFT JOIN resident_profile rp ON rp.person_id = p.stable_id AND rp.source_present = 1
        LEFT JOIN workplace_staff ws
          ON ws.person_id = p.stable_id AND ws.workplace_building_id = ? AND ws.source_present = 1
        WHERE rp.home_building_id = ? OR ws.person_id IS NOT NULL
        ORDER BY CASE WHEN rp.home_building_id = ? THEN 0 ELSE 1 END, p.display_name
        LIMIT 24
      `)
      .all(stableId, stableId, stableId, stableId, stableId) as SqlRow[];
    for (const person of associatedPeople) {
      addRelated({
        stableId: String(person.stable_id),
        kind: "person",
        label: String(person.display_name ?? person.stable_id),
        detail: String(person.connection),
      });
    }
    const staff = sqlite
      .prepare(`
        SELECT p.display_name, ws.staff_role, ws.staff_level
        FROM workplace_staff ws
        JOIN person p ON p.stable_id = ws.person_id
        WHERE ws.workplace_building_id = ? AND ws.source_present = 1
        ORDER BY CASE WHEN ws.staff_level = 'lead' THEN 0 ELSE 1 END, p.display_name
      `)
      .all(stableId) as SqlRow[];
    const wealthSnapshot = sqlite
      .prepare(`
        SELECT group_concat(DISTINCT wealth_class) AS wealth_classes
        FROM resident_profile
        WHERE home_building_id = ? AND source_present = 1 AND wealth_class IS NOT NULL
      `)
      .get(stableId) as { wealth_classes: string | null };
    const factionLinks = splitStoredIds(building.faction_ids)
      .map((factionId) => entitySummary(factionId))
      .filter((item): item is EntityLink => Boolean(item));
    factionLinks.forEach(addRelated);
    const story = storyProfileForEntity(stableId);
    const narrative = projectBuildingNarrative({
      title: String(building.name ?? stableId),
      address: building.address ? String(building.address) : null,
      district: String(building.district_name),
      landUse: building.land_use ? String(building.land_use) : null,
      specificUse: building.specific_use ? String(building.specific_use) : null,
      residentCount: Number(building.permanent_residents ?? 0),
      householdCount: Number(building.household_units ?? 0),
      workplaceName: building.workplace_name ? String(building.workplace_name) : null,
      workplaceLead: building.workplace_lead_name ? String(building.workplace_lead_name) : null,
      staff: staff.map((member) => ({
        name: String(member.display_name),
        role: member.staff_role ? String(member.staff_role) : null,
        isLead: member.staff_level === "lead",
      })),
    });
    const canonicalCues: AtTableCue[] = [
      associatedPeople.length > 0
        ? {
            label: "Who is here",
            value: naturalList(
              associatedPeople.slice(0, 8).map((person) =>
                person.connection
                  ? `${String(person.display_name)} (${String(person.connection).toLowerCase()})`
                  : String(person.display_name),
              ),
            ),
            source: "canonical" as const,
          }
        : null,
      Number(building.permanent_residents) > 0
        ? {
            label: "Household situation",
            value: `${building.permanent_residents} resident${Number(building.permanent_residents) === 1 ? "" : "s"}; ${building.household_units ?? 0} household${Number(building.household_units) === 1 ? "" : "s"}.`,
            source: "canonical" as const,
          }
        : null,
      wealthSnapshot.wealth_classes
        ? {
            label: "Economic picture",
            value: `Resident wealth classes: ${wealthSnapshot.wealth_classes}.`,
            source: "canonical" as const,
          }
        : null,
      factionLinks.length > 0
        ? {
            label: "Faction ties",
            value: naturalList(factionLinks.map((faction) => faction.label)),
            source: "canonical" as const,
          }
        : null,
    ].filter(present);
    const fields = [
      building.address ? { label: "Address", value: String(building.address) } : null,
      building.land_use ? { label: "Land use", value: String(building.land_use) } : null,
      building.specific_use ? { label: "Specific use", value: String(building.specific_use) } : null,
      building.road_id ? { label: "Road ID", value: String(building.road_id) } : null,
      building.permanent_residents !== null
        ? { label: "Permanent residents", value: String(building.permanent_residents) }
        : null,
      building.household_units !== null
        ? { label: "Households", value: String(building.household_units) }
        : null,
      Number(building.group_quarter_residents) > 0
        ? { label: "Group-quarter residents", value: String(building.group_quarter_residents) }
        : null,
      building.workplace_name
        ? { label: "Workplace", value: String(building.workplace_name) }
        : null,
      building.total_staff_count !== null
        ? { label: "Workplace staff", value: String(building.total_staff_count) }
        : null,
      building.workplace_lead_name
        ? { label: "Workplace lead", value: String(building.workplace_lead_name) }
        : null,
      building.visibility ? { label: "Visibility", value: String(building.visibility) } : null,
    ].filter((field): field is { label: string; value: string } => Boolean(field));

    return {
      stableId,
      kind: "building",
      title: String(building.name ?? stableId),
      subtitle: String(building.address ?? building.district_name),
      district: String(building.district_name),
      sourceCompleteness: String(building.source_completeness),
      map: {
        x: Number(building.centroid_x),
        y: Number(building.centroid_y),
        mapDistrict: mapDistrictName(String(building.district_name)),
      },
      mapTargets: [{ label: "Show on map", stableId }],
      atTable: {
        summary: narrative,
        currentSituation:
          storySituation(story) ??
          (promptRows[0] ? `Authored street detail: ${promptRows[0].prompt_text}` : null),
        cues: [...canonicalCues, ...dmStoryCues(story)],
      },
      story,
      fields,
      prompts: formatPrompts(promptRows),
      related,
      notice:
        building.source_completeness === "census-v20"
          ? "Current building facts come from the v20 census; residents and workplace links are resolved from normalized SQLite tables imported from the relationship CSV set."
          : "This record is populated from authored overlay data.",
    };
  }

  if (entity.entity_type === "person") {
    const person = sqlite
      .prepare(`
        SELECT p.*, rp.*
        FROM person p
        LEFT JOIN resident_profile rp ON rp.person_id = p.stable_id AND rp.source_present = 1
        WHERE p.stable_id = ?
      `)
      .get(stableId) as SqlRow;
    const memberships = sqlite
      .prepare(`
        SELECT f.stable_id, f.name, fm.faction_role, fm.day_job, fm.workplace,
               fm.home_address, fm.home_district
        FROM faction_membership fm
        JOIN faction f ON f.stable_id = fm.faction_id
        WHERE fm.person_id = ? AND fm.source_present = 1
        ORDER BY f.name
      `)
      .all(stableId) as SqlRow[];
    const householdRelationships = sqlite
      .prepare(`
        SELECT p.stable_id, p.display_name,
               CASE WHEN hr.person_a_id = ?
                    THEN hr.a_to_b_relationship ELSE hr.b_to_a_relationship END AS connection,
               rp.residence_unit_id AS related_residence_unit_id,
               rp.home_address AS related_home_address
        FROM household_relationship hr
        JOIN person p
          ON p.stable_id = CASE WHEN hr.person_a_id = ? THEN hr.person_b_id ELSE hr.person_a_id END
        LEFT JOIN resident_profile rp ON rp.person_id = p.stable_id AND rp.source_present = 1
        WHERE (hr.person_a_id = ? OR hr.person_b_id = ?) AND hr.source_present = 1
        ORDER BY p.display_name
      `)
      .all(stableId, stableId, stableId, stableId) as SqlRow[];
    const residencePeers = person.residence_unit_id
      ? (sqlite
          .prepare(
            person.residence_type === "Household"
              ? `
                  SELECT p.stable_id, p.display_name,
                         'Shared household' AS connection,
                         COALESCE(hm.relationship_to_lead, hm.household_role, 'Household member') AS residence_role
                  FROM household_member self
                  JOIN household_member hm ON hm.household_id = self.household_id AND hm.source_present = 1
                  JOIN person p ON p.stable_id = hm.person_id
                  WHERE self.person_id = ? AND self.source_present = 1 AND hm.person_id <> ?
                  ORDER BY p.display_name
                `
              : `
                  SELECT p.stable_id, p.display_name, 'Group-quarter peer' AS connection,
                         NULL AS residence_role
                  FROM group_quarter_member self
                  JOIN group_quarter_member gqm
                    ON gqm.group_quarter_id = self.group_quarter_id AND gqm.source_present = 1
                  JOIN person p ON p.stable_id = gqm.person_id
                  WHERE self.person_id = ? AND self.source_present = 1 AND gqm.person_id <> ?
                  ORDER BY p.display_name
                  LIMIT 16
                `,
          )
          .all(stableId, stableId) as SqlRow[])
      : [];
    const coworkers = person.workplace_building_id
      ? (sqlite
          .prepare(`
            SELECT p.stable_id, p.display_name, COALESCE(ws.staff_role, 'Coworker') AS connection,
                   ws.staff_role, ws.staff_level
            FROM workplace_staff self
            JOIN workplace_staff ws
              ON ws.workplace_building_id = self.workplace_building_id AND ws.source_present = 1
            JOIN person p ON p.stable_id = ws.person_id
            WHERE self.person_id = ? AND self.source_present = 1 AND ws.person_id <> ?
            ORDER BY CASE WHEN ws.staff_level = 'lead' THEN 0 ELSE 1 END, p.display_name
            LIMIT 16
          `)
          .all(stableId, stableId) as SqlRow[])
      : [];
    const familyEmploymentLinks = sqlite
      .prepare(`
        SELECT p.stable_id, p.display_name, fel.relationship_to_lead, fel.employee_role,
               w.name AS workplace_name, w.address AS workplace_address,
               CASE WHEN fel.lead_person_id = ? THEN 'employee' ELSE 'lead' END AS connection_side
        FROM family_employment_link fel
        JOIN person p
          ON p.stable_id = CASE WHEN fel.lead_person_id = ?
                                THEN fel.employee_person_id ELSE fel.lead_person_id END
        LEFT JOIN workplace w ON w.building_id = fel.workplace_building_id AND w.source_present = 1
        WHERE (fel.lead_person_id = ? OR fel.employee_person_id = ?) AND fel.source_present = 1
        ORDER BY p.display_name
      `)
      .all(stableId, stableId, stableId, stableId) as SqlRow[];
    const related: EntityLink[] = [];
    const addRelated = (item: EntityLink | null) => {
      if (item && !related.some((existing) => existing.stableId === item.stableId)) related.push(item);
    };
    if (person.home_building_id) addRelated(entitySummary(String(person.home_building_id)));
    if (person.workplace_building_id) addRelated(entitySummary(String(person.workplace_building_id)));
    for (const row of [...householdRelationships, ...residencePeers, ...coworkers]) {
      addRelated({
        stableId: String(row.stable_id),
        kind: "person",
        label: String(row.display_name ?? row.stable_id),
        detail: row.connection ? String(row.connection) : null,
      });
    }
    for (const membership of memberships) {
      addRelated({
        stableId: String(membership.stable_id),
        kind: "faction",
        label: String(membership.name),
        detail: membership.faction_role ? String(membership.faction_role) : null,
      });
    }
    const connectionCandidates: ConnectionCandidate[] = [];
    const addConnectionCandidate = (candidate: ConnectionCandidate | null) => {
      if (candidate) connectionCandidates.push(candidate);
    };
    const homeSummary = person.home_building_id
      ? entitySummary(String(person.home_building_id))
      : null;
    const workplaceSummary = person.workplace_building_id
      ? entitySummary(String(person.workplace_building_id))
      : null;
    addConnectionCandidate(
      homeSummary
        ? {
            stableId: homeSummary.stableId,
            kind: homeSummary.kind,
            label: homeSummary.label,
            connectionLabel: "Home",
            context: `Home location${person.home_address ? ` at ${String(person.home_address)}` : ""}${person.residence_unit_id ? ` for ${String(person.residence_type ?? "residence")} ${String(person.residence_unit_id)}` : ""}.`,
            group: "places",
            priority: 10,
          }
        : null,
    );
    addConnectionCandidate(
      workplaceSummary
        ? {
            stableId: workplaceSummary.stableId,
            kind: workplaceSummary.kind,
            label: workplaceSummary.label,
            connectionLabel: "Workplace",
            context: `Work location${person.workplace_address ? ` at ${String(person.workplace_address)}` : ""}${person.workplace_role ? `; recorded role: ${String(person.workplace_role)}` : ""}.`,
            group: "places",
            priority: 10,
          }
        : null,
    );
    for (const row of householdRelationships) {
      const relationship = String(row.connection ?? "Household relationship");
      const sharesResidence =
        person.residence_unit_id &&
        row.related_residence_unit_id &&
        String(person.residence_unit_id) === String(row.related_residence_unit_id);
      addConnectionCandidate({
        stableId: String(row.stable_id),
        kind: "person",
        label: String(row.display_name ?? row.stable_id),
        connectionLabel: relationship,
        context: `Explicit census relationship: ${relationship}.${sharesResidence ? ` Shares ${String(person.residence_type ?? "residence")} ${String(person.residence_unit_id)}${person.home_address ? ` at ${String(person.home_address)}` : ""}.` : ""}`,
        group: "household",
        priority: /spouse|parent|child|sibling|guardian|ward/i.test(relationship) ? 100 : 90,
      });
    }
    for (const row of familyEmploymentLinks) {
      const employeeSide = row.connection_side === "lead";
      const role = row.employee_role ? String(row.employee_role) : null;
      const relationship = row.relationship_to_lead
        ? String(row.relationship_to_lead)
        : "Family-employment link";
      addConnectionCandidate({
        stableId: String(row.stable_id),
        kind: "person",
        label: String(row.display_name ?? row.stable_id),
        connectionLabel: employeeSide ? "Workplace lead / family" : "Family employee",
        context: `${employeeSide ? "Leads" : "Works at"} ${String(row.workplace_name ?? person.workplace_name ?? "the same workplace")}${role ? ` as ${role}` : ""}; recorded family relationship: ${relationship}.`,
        group: "workplace",
        priority: 85,
      });
    }
    for (const row of coworkers) {
      const isLead = row.staff_level === "lead";
      const role = row.staff_role ? String(row.staff_role) : String(row.connection ?? "coworker");
      addConnectionCandidate({
        stableId: String(row.stable_id),
        kind: "person",
        label: String(row.display_name ?? row.stable_id),
        connectionLabel: isLead ? "Workplace lead" : "Coworker",
        context: `${isLead ? "Leads" : "Works at"} ${String(person.workplace_name ?? "the same workplace")}${role ? ` as ${role}` : ""}${person.workplace_address ? ` at ${String(person.workplace_address)}` : ""}.`,
        group: "workplace",
        priority: isLead ? 75 : 40,
      });
    }
    const explicitRelationshipIds = new Set(
      householdRelationships.map((relationship) => String(relationship.stable_id)),
    );
    for (const row of residencePeers) {
      if (explicitRelationshipIds.has(String(row.stable_id))) continue;
      const groupQuarter = person.residence_type !== "Household";
      const residenceRole = row.residence_role ? String(row.residence_role) : null;
      addConnectionCandidate({
        stableId: String(row.stable_id),
        kind: "person",
        label: String(row.display_name ?? row.stable_id),
        connectionLabel: groupQuarter ? "Group-quarter peer" : "Shared household",
        context: `Shares ${String(person.residence_type ?? "residence").toLocaleLowerCase()} ${String(person.residence_unit_id ?? "")}${person.home_address ? ` at ${String(person.home_address)}` : ""}.${residenceRole ? ` Their recorded role relative to the household lead is ${residenceRole}.` : ""}`,
        group: "residence",
        priority: 20,
      });
    }
    for (const membership of memberships) {
      const factionRole = membership.faction_role
        ? String(membership.faction_role)
        : "Member";
      addConnectionCandidate({
        stableId: String(membership.stable_id),
        kind: "faction",
        label: String(membership.name),
        connectionLabel: factionRole,
        context: `Recorded faction membership: ${factionRole}.`,
        group: "organizations",
        priority: 10,
      });
    }
    const connections = buildPersonConnections(connectionCandidates);
    const residenceSize = person.residence_unit_id
      ? Number(
          (
            sqlite
              .prepare(
                person.residence_type === "Household"
                  ? "SELECT count(*) AS count FROM household_member WHERE household_id = ? AND source_present = 1"
                  : "SELECT count(*) AS count FROM group_quarter_member WHERE group_quarter_id = ? AND source_present = 1",
              )
              .get(String(person.residence_unit_id)) as { count: number }
          ).count,
        )
      : null;
    const personPrompts = promptRowsForEntity(stableId);
    const story = storyProfileForEntity(stableId);
    const narrative = projectPersonNarrative({
      name: String(person.display_name ?? stableId),
      age: person.age === null ? null : Number(person.age),
      ageBand: person.age_band ? String(person.age_band) : null,
      ancestry: person.ancestry ? String(person.ancestry) : null,
      dailyRole: person.occupation_daily_role ? String(person.occupation_daily_role) : null,
      homeAddress: person.home_address ? String(person.home_address) : null,
      residenceType: person.residence_type ? String(person.residence_type) : null,
      residenceUnitId: person.residence_unit_id ? String(person.residence_unit_id) : null,
      residenceSize,
      wealthClass: person.wealth_class ? String(person.wealth_class) : null,
      workplaceName: person.workplace_name ? String(person.workplace_name) : null,
      workplaceAddress: person.workplace_address ? String(person.workplace_address) : null,
      workplaceDistrict: person.workplace_district ? String(person.workplace_district) : null,
      workplaceSpecificUse: person.workplace_specific_use
        ? String(person.workplace_specific_use)
        : null,
      workplaceRole: person.workplace_role ? String(person.workplace_role) : null,
      relationships: householdRelationships.map((relationship) => ({
        name: String(relationship.display_name ?? relationship.stable_id),
        relationship: String(relationship.connection ?? "household relationship"),
      })),
      factions: memberships.map((membership) => ({
        name: String(membership.name),
        role: membership.faction_role ? String(membership.faction_role) : null,
      })),
    });
    const householdSituation = person.home_address
      ? `${person.residence_type ?? "Residence"} ${person.residence_unit_id ?? ""} at ${person.home_address}${residenceSize ? `; ${residenceSize} resident${residenceSize === 1 ? "" : "s"}.` : "."}`
      : null;
    const canonicalCues: AtTableCue[] = [
      householdSituation
        ? { label: "Household situation", value: householdSituation, source: "canonical" as const }
        : null,
      person.workplace_name
        ? {
            label: "Workplace",
            value: `${String(person.workplace_name)}${person.workplace_specific_use ? ` (${String(person.workplace_specific_use)})` : ""}${person.workplace_address ? ` · ${String(person.workplace_address)}` : ""}${person.workplace_district ? ` · ${String(person.workplace_district)}` : ""}${person.workplace_role ? ` · ${String(person.workplace_role)}` : ""}`,
            source: "canonical" as const,
          }
        : null,
      householdRelationships.length > 0
        ? {
            label: "Household relationships",
            value: naturalList(
              householdRelationships.map(
                (relationship) =>
                  `${String(relationship.display_name ?? relationship.stable_id)} (${String(relationship.connection ?? "relationship")})`,
              ),
            ),
            source: "canonical" as const,
          }
        : null,
      person.wealth_class
        ? {
            label: "Economic picture",
            value: `Census wealth class: ${String(person.wealth_class)}${person.occupation_daily_role ? `; livelihood: ${String(person.occupation_daily_role)}.` : "."}`,
            source: "canonical" as const,
          }
        : null,
      memberships.length > 0
        ? {
            label: "Recorded loyalties",
            value: naturalList(
              memberships.map((membership) =>
                membership.faction_role
                  ? `${String(membership.name)} (${String(membership.faction_role)})`
                  : String(membership.name),
              ),
            ),
            source: "canonical" as const,
          }
        : null,
      person.public_notes
        ? { label: "Public note", value: String(person.public_notes), source: "canonical" as const }
        : null,
    ].filter(present);
    const mapTargets = [
      person.home_building_id
        ? { label: "Show home on map", stableId: String(person.home_building_id) }
        : null,
      person.workplace_building_id
        ? { label: "Show workplace on map", stableId: String(person.workplace_building_id) }
        : null,
    ].filter(
      (target, index, targets): target is { label: string; stableId: string } =>
        Boolean(target) && targets.findIndex((candidate) => candidate?.stableId === target?.stableId) === index,
    );
    const fields = [
      person.age ? { label: "Age", value: `${person.age} · ${person.age_band}` } : null,
      person.ancestry ? { label: "Ancestry", value: String(person.ancestry) } : null,
      person.origin_residency
        ? { label: "Origin / residency", value: String(person.origin_residency) }
        : null,
      person.wealth_class ? { label: "Wealth", value: String(person.wealth_class) } : null,
      person.occupation_daily_role
        ? { label: "Daily role", value: String(person.occupation_daily_role) }
        : null,
      person.home_address ? { label: "Home", value: String(person.home_address) } : null,
      person.residence_unit_id
        ? { label: person.residence_type === "Household" ? "Household" : "Group quarters", value: String(person.residence_unit_id) }
        : null,
      person.household_role ? { label: "Residence role", value: String(person.household_role) } : null,
      person.workplace_name ? { label: "Workplace", value: String(person.workplace_name) } : null,
      person.workplace_role ? { label: "Work role", value: String(person.workplace_role) } : null,
      person.commute_class ? { label: "Commute", value: String(person.commute_class) } : null,
      ...memberships.map((membership) => ({
        label: `Faction · ${membership.name}`,
        value: String(membership.faction_role ?? "member"),
      })),
    ].filter((field): field is { label: string; value: string } => Boolean(field));
    return {
      stableId,
      kind: "person",
      title: String(person.display_name ?? stableId),
      subtitle: person.occupation_daily_role
        ? String(person.occupation_daily_role)
        : memberships[0]
          ? String(memberships[0].faction_role ?? memberships[0].name)
          : "Referenced person",
      district: person.home_district ? String(person.home_district) : null,
      sourceCompleteness: String(person.source_completeness),
      mapTargets,
      atTable: {
        summary: narrative,
        currentSituation:
          storySituation(story) ??
          (person.private_pressure
            ? String(person.private_pressure)
            : personPrompts[0]
              ? `Authored street detail: ${personPrompts[0].prompt_text}`
              : null),
        cues: [...canonicalCues, ...dmStoryCues(story)],
      },
      story,
      fields,
      prompts: formatPrompts(personPrompts),
      related,
      connections,
      notice:
        person.source_completeness === "census-v20"
          ? "Current identity and residence come from the v20 census; household, workplace, and family edges are resolved from normalized SQLite tables imported from the v19 relationship set."
          : "This person is present only in an authored overlay.",
    };
  }

  if (entity.entity_type === "faction") {
    const faction = sqlite.prepare("SELECT * FROM faction WHERE stable_id = ?").get(stableId) as SqlRow;
    const members = sqlite
      .prepare(`
        SELECT p.stable_id, p.display_name, fm.faction_role
        FROM faction_membership fm
        JOIN person p ON p.stable_id = fm.person_id
        WHERE fm.faction_id = ? AND fm.source_present = 1
        ORDER BY CASE WHEN fm.faction_role LIKE '%Leader%' THEN 0 ELSE 1 END, p.display_name
        LIMIT 12
      `)
      .all(stableId) as SqlRow[];
    const count = sqlite
      .prepare("SELECT count(*) AS count FROM faction_membership WHERE faction_id = ? AND source_present = 1")
      .get(stableId) as { count: number };
    const fields = [
      faction.public_face ? { label: "Public face", value: String(faction.public_face) } : null,
      faction.core_activities ? { label: "Core activities", value: String(faction.core_activities) } : null,
      faction.use_of_force ? { label: "Use of force", value: String(faction.use_of_force) } : null,
      faction.political_relationships
        ? { label: "Political relationships", value: String(faction.political_relationships) }
        : null,
      { label: "Active census / overlay members", value: String(count.count) },
    ].filter((field): field is { label: string; value: string } => Boolean(field));
    const related: EntityLink[] = members.map((member) => ({
      stableId: String(member.stable_id),
      kind: "person",
      label: String(member.display_name ?? member.stable_id),
      detail: member.faction_role ? String(member.faction_role) : null,
    }));
    for (const linkedId of [faction.headquarters_entity_id, faction.leader_person_id]) {
      if (!linkedId) continue;
      const linked = entitySummary(String(linkedId));
      if (linked && !related.some((item) => item.stableId === linked.stableId)) related.unshift(linked);
    }
    const story = storyProfileForEntity(stableId);
    const factionSummary = [
      `${String(faction.name)} is ${faction.faction_type ? `a ${String(faction.faction_type)} faction` : "an Arentoria faction"}.`,
      faction.public_face ? String(faction.public_face) : null,
    ]
      .filter(Boolean)
      .join(" ");
    const factionCues: AtTableCue[] = [
      faction.core_activities
        ? { label: "What they do", value: String(faction.core_activities), source: "canonical" as const }
        : null,
      faction.leader_person_id
        ? {
            label: "Who is involved",
            value: `${count.count} recorded members; leader ${entitySummary(String(faction.leader_person_id))?.label ?? String(faction.leader_person_id)}.`,
            source: "canonical" as const,
          }
        : {
            label: "Who is involved",
            value: `${count.count} recorded members.`,
            source: "canonical" as const,
          },
      faction.political_relationships
        ? {
            label: "Important connections",
            value: String(faction.political_relationships),
            source: "canonical" as const,
          }
        : null,
    ].filter(present);
    return {
      stableId,
      kind: "faction",
      title: String(faction.name),
      subtitle: faction.faction_type ? String(faction.faction_type) : "Faction",
      district: null,
      mapTargets:
        faction.headquarters_entity_id && String(faction.headquarters_entity_id).startsWith("AR-")
          ? [{ label: "Show headquarters on map", stableId: String(faction.headquarters_entity_id) }]
          : [],
      atTable: {
        summary: factionSummary,
        currentSituation: storySituation(story),
        cues: [...factionCues, ...dmStoryCues(story)],
      },
      story,
      fields,
      prompts: formatPrompts(promptRowsForEntity(stableId)),
      related,
    };
  }

  if (entity.entity_type === "road") {
    const road = sqlite.prepare("SELECT * FROM road WHERE stable_id = ?").get(stableId) as SqlRow;
    const story = storyProfileForEntity(stableId);
    return {
      stableId,
      kind: "road",
      title: String(road.name),
      subtitle: stableId,
      district: null,
      mapTargets: [],
      atTable: {
        summary: `${String(road.name)} is a recorded Arentoria road (${stableId}).`,
        currentSituation: storySituation(story),
        cues: dmStoryCues(story),
      },
      story,
      fields: [
        { label: "Name source", value: String(road.name_source) },
        { label: "Generation zone", value: String(road.generation_zone) },
        { label: "Map marker", value: `${road.marker_x}, ${road.marker_y}` },
      ],
      prompts: [],
      related: [],
    };
  }

  if (entity.entity_type === "prompt") {
    const prompt = sqlite.prepare("SELECT * FROM district_prompt WHERE stable_id = ?").get(stableId) as SqlRow;
    const relatedIds = sqlite
      .prepare("SELECT entity_stable_id FROM prompt_entity_link WHERE prompt_id = ?")
      .all(stableId) as Array<{ entity_stable_id: string }>;
    const story = storyProfileForEntity(stableId);
    return {
      stableId,
      kind: "prompt",
      title: String(prompt.prompt_type),
      subtitle: `${prompt.district_name} · ${prompt.best_time}`,
      district: String(prompt.district_name),
      mapTargets: relatedIds
        .map((row) => row.entity_stable_id)
        .filter((linkedId) => linkedId.startsWith("AR-"))
        .map((linkedId) => ({ label: "Show linked place on map", stableId: linkedId })),
      atTable: {
        summary: String(prompt.prompt_text),
        currentSituation: storySituation(story),
        cues: [
          prompt.dm_connection
            ? {
                label: "DM connection",
                value: String(prompt.dm_connection),
                source: "canonical" as const,
              }
            : null,
          ...dmStoryCues(story),
        ].filter(present),
      },
      story,
      fields: prompt.dm_connection
        ? [{ label: "DM connection", value: String(prompt.dm_connection) }]
        : [],
      prompts: [
        {
          stableId,
          type: String(prompt.prompt_type),
          bestTime: String(prompt.best_time),
          text: String(prompt.prompt_text),
          dmConnection: prompt.dm_connection ? String(prompt.dm_connection) : null,
        },
      ],
      related: relatedIds
        .map((row) => entitySummary(row.entity_stable_id))
        .filter((item): item is EntityLink => Boolean(item)),
    };
  }

  if (entity.entity_type === "infrastructure") {
    const site = sqlite.prepare("SELECT * FROM infrastructure WHERE stable_id = ?").get(stableId) as SqlRow;
    const story = storyProfileForEntity(stableId);
    return {
      stableId,
      kind: "infrastructure",
      title: String(site.name),
      subtitle: site.location ? String(site.location) : stableId,
      district: null,
      mapTargets: [],
      atTable: {
        summary: site.description
          ? String(site.description)
          : `${String(site.name)} is an infrastructure location in Arentoria.`,
        currentSituation: storySituation(story),
        cues: [
          site.hook
            ? { label: "Possible trouble", value: String(site.hook), source: "canonical" as const }
            : null,
          ...dmStoryCues(story),
        ].filter(present),
      },
      story,
      fields: [
        site.description ? { label: "Description", value: String(site.description) } : null,
        site.hook ? { label: "Hook / use", value: String(site.hook) } : null,
      ].filter((field): field is { label: string; value: string } => Boolean(field)),
      prompts: [],
      related: [],
    };
  }

  const district = sqlite.prepare("SELECT * FROM district WHERE stable_id = ?").get(stableId) as SqlRow;
  const districtPrompts = sqlite
    .prepare(`
      SELECT stable_id, prompt_type, best_time, prompt_text, dm_connection
      FROM district_prompt
      WHERE district_name = ? AND source_present = 1
      ORDER BY prompt_number
      LIMIT 5
    `)
    .all(String(district.name)) as ReturnType<typeof promptRowsForEntity>;
  const notableBusinesses = sqlite
    .prepare(`
      SELECT w.building_id, w.name, w.specific_use, w.total_staff_count
      FROM workplace w
      WHERE w.district = ? AND w.source_present = 1
      ORDER BY w.total_staff_count DESC, w.name
      LIMIT 6
    `)
    .all(String(district.name)) as SqlRow[];
  const presentFactions = sqlite
    .prepare(`
      SELECT f.stable_id, f.name, count(*) AS member_count
      FROM faction_membership fm
      JOIN faction f ON f.stable_id = fm.faction_id
      WHERE fm.home_district = ? AND fm.source_present = 1
      GROUP BY f.stable_id, f.name
      ORDER BY member_count DESC, f.name
      LIMIT 5
    `)
    .all(String(district.name)) as SqlRow[];
  const districtRelated: EntityLink[] = [
    ...notableBusinesses.map((business) => ({
      stableId: String(business.building_id),
      kind: "building" as const,
      label: String(business.name),
      detail: `${business.specific_use ?? "Business"} · ${business.total_staff_count} staff`,
    })),
    ...presentFactions.map((faction) => ({
      stableId: String(faction.stable_id),
      kind: "faction" as const,
      label: String(faction.name),
      detail: `${faction.member_count} resident member${Number(faction.member_count) === 1 ? "" : "s"}`,
    })),
  ];
  const story = storyProfileForEntity(stableId);
  const districtCues: AtTableCue[] = [
    notableBusinesses.length > 0
      ? {
          label: "Notable businesses",
          value: naturalList(notableBusinesses.map((business) => String(business.name))),
          source: "canonical" as const,
        }
      : null,
    presentFactions.length > 0
      ? {
          label: "Faction presence",
          value: naturalList(presentFactions.map((faction) => String(faction.name))),
          source: "canonical" as const,
        }
      : null,
  ].filter(present);
  return {
    stableId,
    kind: "district",
    title: String(district.name),
    subtitle: "District record",
    district: String(district.name),
    mapTargets: [],
    atTable: {
      summary: district.opening_description
        ? String(district.opening_description)
        : `${String(district.name)} is one of Arentoria's ten mapped districts.`,
      currentSituation:
        storySituation(story) ??
        (districtPrompts[0] ? `Authored street detail: ${districtPrompts[0].prompt_text}` : null),
      cues: [...districtCues, ...dmStoryCues(story)],
    },
    story,
    fields: district.opening_description
      ? [{ label: "Opening description", value: String(district.opening_description) }]
      : [],
    prompts: formatPrompts(districtPrompts),
    related: districtRelated,
  };
}

export function searchEntities(input: string): SearchResult[] {
  const matchQuery = normalizeSearchQuery(input);
  if (!matchQuery) return [];
  const { sqlite } = getDatabase();
  return (
    sqlite
      .prepare(`
        SELECT stable_id, entity_type, title, subtitle,
               snippet(search_index, 4, '', '', '…', 14) AS excerpt
        FROM search_index
        WHERE search_index MATCH ?
        ORDER BY bm25(search_index, 4.0, 0.2, 8.0, 2.0, 1.0)
        LIMIT 18
      `)
      .all(matchQuery) as Array<{
      stable_id: string;
      entity_type: EntityKind;
      title: string;
      subtitle: string | null;
      excerpt: string | null;
    }>
  ).map((row) => ({
    stableId: row.stable_id,
    kind: row.entity_type,
    title: row.title,
    subtitle: row.subtitle,
    excerpt: row.excerpt,
  }));
}

export function getPlaceCategories(): PlaceCategorySummary[] {
  const { sqlite } = getDatabase();
  const rows = sqlite
    .prepare(`
      SELECT specific_use, count(*) AS count
      FROM workplace
      WHERE source_present = 1 AND specific_use IS NOT NULL AND trim(specific_use) <> ''
      GROUP BY specific_use
      ORDER BY specific_use
    `)
    .all() as Array<{ specific_use: string; count: number }>;

  return placeCategoryDefinitions.map((category) => {
    const types = rows
      .filter((row) => categorizePlaceType(row.specific_use) === category.id)
      .map((row) => ({ specificUse: row.specific_use, count: Number(row.count) }));
    return {
      ...category,
      count: types.reduce((total, type) => total + type.count, 0),
      types,
    };
  });
}

export function getPlacesByType(specificUse: string): PlaceSearchResult[] {
  const { sqlite } = getDatabase();
  return (
    sqlite
      .prepare(`
        SELECT w.building_id, w.name, w.address, w.district, w.specific_use,
               w.total_staff_count
        FROM workplace w
        JOIN building b ON b.stable_id = w.building_id
        WHERE w.source_present = 1 AND w.specific_use = ?
        ORDER BY w.district, w.name, w.building_id
      `)
      .all(specificUse) as Array<{
      building_id: string;
      name: string;
      address: string;
      district: string;
      specific_use: string;
      total_staff_count: number;
    }>
  ).map((row) => ({
    stableId: row.building_id,
    name: row.name,
    address: row.address,
    district: row.district,
    specificUse: row.specific_use,
    staffCount: Number(row.total_staff_count),
  }));
}

function sessionItem(stableId: string): EntityLink | null {
  const detail = getEntityDetail(stableId);
  if (!detail) return null;
  return {
    stableId: detail.stableId,
    kind: detail.kind,
    label: detail.title,
    detail: detail.subtitle,
    storyLine: firstSentence(detail.atTable.summary),
    mapTargetId: detail.map ? detail.stableId : detail.mapTargets[0]?.stableId ?? null,
  };
}

export function getDashboardSnapshot(): DashboardSnapshot {
  const { sqlite } = getDatabase();
  const count = (table: string, clause = "") =>
    Number((sqlite.prepare(`SELECT count(*) AS count FROM ${table} ${clause}`).get() as { count: number }).count);

  const districts = sqlite
    .prepare(`
      SELECT d.stable_id, d.name,
             count(DISTINCT b.stable_id) AS building_count,
             count(DISTINCT p.stable_id) AS prompt_count
      FROM district d
      LEFT JOIN building b ON b.district_name = d.name
      LEFT JOIN district_prompt p ON p.district_name = d.name AND p.source_present = 1
      GROUP BY d.stable_id, d.name
      ORDER BY d.name
    `)
    .all() as Array<{ stable_id: string; name: string; building_count: number; prompt_count: number }>;
  const pinned = (
    sqlite.prepare("SELECT entity_stable_id FROM session_pin ORDER BY pinned_at DESC").all() as Array<{
      entity_stable_id: string;
    }>
  )
    .map((row) => sessionItem(row.entity_stable_id))
    .filter((item): item is EntityLink => Boolean(item));
  const recent = (
    sqlite.prepare("SELECT entity_stable_id FROM recent_view ORDER BY viewed_at DESC LIMIT 8").all() as Array<{
      entity_stable_id: string;
    }>
  )
    .map((row) => entitySummary(row.entity_stable_id))
    .filter((item): item is EntityLink => Boolean(item));
  const initialDetail = getEntityDetail("AR-0738");
  if (!initialDetail) throw new Error("The validated AR-0738 vertical slice is missing from the database.");
  const mapBuildings = Object.fromEntries(
    (
      sqlite
        .prepare("SELECT stable_id, COALESCE(name, stable_id) AS label, address FROM building")
        .all() as Array<{ stable_id: string; label: string; address: string | null }>
    ).map((building) => [
      building.stable_id,
      { label: building.label, address: building.address },
    ]),
  );

  return {
    counts: {
      buildings: count("building"),
      namedBuildings: count("building", "WHERE name IS NOT NULL"),
      people: count("person"),
      factions: count("faction"),
      prompts: count("district_prompt", "WHERE source_present = 1"),
      roads: count("road", "WHERE source_present = 1"),
    },
    districts: districts.map((district) => ({
      stableId: district.stable_id,
      name: district.name,
      mapDistrict: mapDistrictName(district.name),
      buildingCount: Number(district.building_count),
      promptCount: Number(district.prompt_count),
    })),
    placeCategories: getPlaceCategories(),
    mapBuildings,
    initialDetail,
    pinned,
    recent,
  };
}
