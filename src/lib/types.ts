export type EntityKind =
  | "building"
  | "person"
  | "faction"
  | "road"
  | "prompt"
  | "district"
  | "infrastructure";

export type EntityLink = {
  stableId: string;
  label: string;
  kind: EntityKind;
  detail?: string | null;
  storyLine?: string | null;
  mapTargetId?: string | null;
};

export type StoryProfile = {
  demeanor: string | null;
  wants: string | null;
  knows: string | null;
  secret: string | null;
  currentProblem: string | null;
  recentEvent: string | null;
  memorableDetail: string | null;
  loyalties: string | null;
  dislikes: string | null;
};

export type AtTableCue = {
  label: string;
  value: string;
  source: "canonical" | "dm";
};

export type AtTableCard = {
  summary: string;
  currentSituation: string | null;
  cues: AtTableCue[];
};

export type MapTarget = {
  label: string;
  stableId: string;
};

export type PromptSummary = {
  stableId: string;
  type: string;
  bestTime: string | null;
  text: string;
  dmConnection: string | null;
};

export type ConnectionGroupId =
  | "household"
  | "workplace"
  | "residence"
  | "organizations"
  | "places";

export type ConnectionSummary = EntityLink & {
  connectionLabel: string;
  context: string;
  group: ConnectionGroupId;
};

export type ConnectionGroup = {
  id: ConnectionGroupId;
  label: string;
  items: ConnectionSummary[];
};

export type PersonConnections = {
  key: ConnectionSummary[];
  groups: ConnectionGroup[];
  total: number;
};

export type EntityDetail = {
  stableId: string;
  kind: EntityKind;
  title: string;
  subtitle: string | null;
  district: string | null;
  sourceCompleteness?: string;
  map?: { x: number; y: number; mapDistrict: string };
  mapTargets: MapTarget[];
  atTable: AtTableCard;
  story: StoryProfile;
  fields: Array<{ label: string; value: string }>;
  prompts: PromptSummary[];
  related: EntityLink[];
  connections?: PersonConnections;
  notice?: string;
};

export type SearchResult = {
  stableId: string;
  kind: EntityKind;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
};

export type DistrictSummary = {
  stableId: string;
  name: string;
  mapDistrict: string;
  buildingCount: number;
  promptCount: number;
};

export type PlaceTypeSummary = {
  specificUse: string;
  count: number;
};

export type PlaceCategorySummary = {
  id: string;
  label: string;
  description: string;
  count: number;
  types: PlaceTypeSummary[];
};

export type PlaceSearchResult = {
  stableId: string;
  name: string;
  address: string;
  district: string;
  specificUse: string;
  staffCount: number;
};

export type DashboardSnapshot = {
  counts: {
    buildings: number;
    namedBuildings: number;
    people: number;
    factions: number;
    prompts: number;
    roads: number;
  };
  districts: DistrictSummary[];
  placeCategories: PlaceCategorySummary[];
  mapBuildings: Record<string, { label: string; address: string | null }>;
  initialDetail: EntityDetail;
  pinned: EntityLink[];
  recent: EntityLink[];
};
