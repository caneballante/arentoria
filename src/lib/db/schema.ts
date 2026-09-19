import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entities = sqliteTable("entity", {
  id: integer("id").primaryKey(),
  stableId: text("stable_id").notNull().unique(),
  entityType: text("entity_type").notNull(),
  sourcePresent: integer("source_present").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const buildings = sqliteTable("building", {
  entityId: integer("entity_id").primaryKey(),
  stableId: text("stable_id").notNull().unique(),
  districtName: text("district_name").notNull(),
  name: text("name"),
  address: text("address"),
  svgPathId: text("svg_path_id").notNull().unique(),
  centroidX: real("centroid_x").notNull(),
  centroidY: real("centroid_y").notNull(),
  sourceCompleteness: text("source_completeness").notNull(),
});

export const buildingCensus = sqliteTable("building_census", {
  buildingId: text("building_id").primaryKey(),
  roadId: text("road_id"),
  streetRoute: text("street_route"),
  primaryLandUse: text("primary_land_use"),
  specificUse: text("specific_use"),
  permanentResidents: integer("permanent_residents").notNull(),
  censusUnits: integer("census_units").notNull(),
  householdUnits: integer("household_units").notNull(),
  groupQuarterResidents: integer("group_quarter_residents").notNull(),
  hasGroupQuarter: integer("has_group_quarter").notNull(),
  residentEstablishmentLeadCount: integer("resident_establishment_lead_count").notNull(),
  workplaceLeadPersonId: text("workplace_lead_person_id"),
  workplaceLeadName: text("workplace_lead_name"),
  workplaceStaffCount: integer("workplace_staff_count").notNull(),
  factionIds: text("faction_ids"),
  locationNotes: text("location_notes"),
  sourcePresent: integer("source_present").notNull(),
});

export const residentProfiles = sqliteTable("resident_profile", {
  personId: text("person_id").primaryKey(),
  givenName: text("given_name"),
  surname: text("surname"),
  age: integer("age"),
  ageBand: text("age_band"),
  ancestry: text("ancestry"),
  ancestryDetail: text("ancestry_detail"),
  heritageMarker: text("heritage_marker"),
  residenceType: text("residence_type").notNull(),
  residenceUnitId: text("residence_unit_id").notNull(),
  householdRole: text("household_role"),
  homeBuildingId: text("home_building_id").notNull(),
  homeAddress: text("home_address").notNull(),
  homeDistrict: text("home_district").notNull(),
  originResidency: text("origin_residency"),
  wealthClass: text("wealth_class"),
  occupationDailyRole: text("occupation_daily_role"),
  workplaceBuildingId: text("workplace_building_id"),
  workplaceName: text("workplace_name"),
  workplaceAddress: text("workplace_address"),
  workplaceDistrict: text("workplace_district"),
  workplaceSpecificUse: text("workplace_specific_use"),
  workplaceRole: text("workplace_role"),
  workplaceStanding: text("workplace_standing"),
  workplaceLegality: text("workplace_legality"),
  commuteClass: text("commute_class"),
  relationshipToHouseholdLead: text("relationship_to_household_lead"),
  householdLeadPersonId: text("household_lead_person_id"),
  householdLeadName: text("household_lead_name"),
  factionIds: text("faction_ids"),
  factionRoles: text("faction_roles"),
  canonicalRole: text("canonical_role"),
  civicOfficeBuildingId: text("civic_office_building_id"),
  primaryFactionId: text("primary_faction_id"),
  publicNotes: text("public_notes"),
  privatePressure: text("private_pressure"),
  sourcePresent: integer("source_present").notNull(),
});

export const households = sqliteTable("household", {
  stableId: text("stable_id").primaryKey(),
  buildingId: text("building_id").notNull(),
  address: text("address").notNull(),
  district: text("district").notNull(),
  unitIndex: integer("unit_index"),
  householdSize: integer("household_size").notNull(),
  wealthClass: text("wealth_class"),
  leadPersonId: text("lead_person_id").notNull(),
  leadName: text("lead_name"),
  householdType: text("household_type"),
  ancestryProfile: text("ancestry_profile"),
  mappedWorkplaces: text("mapped_workplaces"),
  sourcePresent: integer("source_present").notNull(),
});

export const householdMembers = sqliteTable(
  "household_member",
  {
    householdId: text("household_id").notNull(),
    personId: text("person_id").notNull(),
    householdRole: text("household_role"),
    relationshipToLead: text("relationship_to_lead"),
    householdLeadPersonId: text("household_lead_person_id"),
    sourcePresent: integer("source_present").notNull(),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.personId] })],
);

export const householdRelationships = sqliteTable("household_relationship", {
  stableId: text("stable_id").primaryKey(),
  householdId: text("household_id").notNull(),
  personAId: text("person_a_id").notNull(),
  personBId: text("person_b_id").notNull(),
  aToBRelationship: text("a_to_b_relationship").notNull(),
  bToARelationship: text("b_to_a_relationship").notNull(),
  relationshipClass: text("relationship_class"),
  sharedAddress: text("shared_address"),
  generationNote: text("generation_note"),
  sourcePresent: integer("source_present").notNull(),
});

export const groupQuarters = sqliteTable("group_quarter", {
  stableId: text("stable_id").primaryKey(),
  buildingId: text("building_id").notNull(),
  address: text("address").notNull(),
  district: text("district").notNull(),
  propertyName: text("property_name"),
  groupQuarterType: text("group_quarter_type"),
  residentCount: integer("resident_count").notNull(),
  wealthClass: text("wealth_class"),
  sourcePresent: integer("source_present").notNull(),
});

export const groupQuarterMembers = sqliteTable(
  "group_quarter_member",
  {
    groupQuarterId: text("group_quarter_id").notNull(),
    personId: text("person_id").notNull(),
    householdRole: text("household_role"),
    sourcePresent: integer("source_present").notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupQuarterId, table.personId] })],
);

export const workplaces = sqliteTable("workplace", {
  buildingId: text("building_id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  district: text("district").notNull(),
  specificUse: text("specific_use"),
  leadPersonId: text("lead_person_id").notNull(),
  leadName: text("lead_name"),
  nonleadStaffCount: integer("nonlead_staff_count").notNull(),
  totalStaffCount: integer("total_staff_count").notNull(),
  familyEmployeeCount: integer("family_employee_count").notNull(),
  sourcePresent: integer("source_present").notNull(),
});

export const workplaceStaff = sqliteTable(
  "workplace_staff",
  {
    workplaceBuildingId: text("workplace_building_id").notNull(),
    personId: text("person_id").notNull(),
    staffRole: text("staff_role"),
    staffLevel: text("staff_level"),
    familyOfLead: text("family_of_lead"),
    relationshipToLead: text("relationship_to_lead"),
    sameHouseholdAsLead: text("same_household_as_lead"),
    commuteClass: text("commute_class"),
    assignmentMethod: text("assignment_method"),
    sourcePresent: integer("source_present").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workplaceBuildingId, table.personId] })],
);

export const familyEmploymentLinks = sqliteTable(
  "family_employment_link",
  {
    workplaceBuildingId: text("workplace_building_id").notNull(),
    leadPersonId: text("lead_person_id").notNull(),
    employeePersonId: text("employee_person_id").notNull(),
    relationshipToLead: text("relationship_to_lead"),
    employeeRole: text("employee_role"),
    sharedHouseholdId: text("shared_household_id"),
    sharedHomeAddress: text("shared_home_address"),
    sourcePresent: integer("source_present").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workplaceBuildingId, table.leadPersonId, table.employeePersonId] }),
  ],
);

export const sessionPins = sqliteTable("session_pin", {
  entityStableId: text("entity_stable_id").primaryKey(),
  pinnedAt: text("pinned_at").notNull(),
});

export const recentViews = sqliteTable("recent_view", {
  entityStableId: text("entity_stable_id").primaryKey(),
  viewedAt: text("viewed_at").notNull(),
});

export const storyProfiles = sqliteTable("story_profile", {
  entityStableId: text("entity_stable_id").primaryKey(),
  demeanor: text("demeanor"),
  wants: text("wants"),
  knows: text("knows"),
  secret: text("secret"),
  currentProblem: text("current_problem"),
  recentEvent: text("recent_event"),
  memorableDetail: text("memorable_detail"),
  loyalties: text("loyalties"),
  dislikes: text("dislikes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
