import type {
  ConnectionGroupId,
  ConnectionSummary,
  EntityKind,
  PersonConnections,
} from "./types";

export type ConnectionCandidate = {
  stableId: string;
  kind: EntityKind;
  label: string;
  connectionLabel: string;
  context: string;
  group: ConnectionGroupId;
  priority: number;
};

const groupLabels: Record<ConnectionGroupId, string> = {
  household: "Household & family",
  workplace: "Workplace",
  residence: "Shared residence",
  organizations: "Organizations",
  places: "Places",
};

type AggregatedConnection = ConnectionCandidate & {
  labels: string[];
  contexts: string[];
};

export function buildPersonConnections(candidates: ConnectionCandidate[]): PersonConnections {
  const aggregated = new Map<string, AggregatedConnection>();

  for (const candidate of candidates) {
    const existing = aggregated.get(candidate.stableId);
    if (!existing) {
      aggregated.set(candidate.stableId, {
        ...candidate,
        labels: [candidate.connectionLabel],
        contexts: [candidate.context],
      });
      continue;
    }
    if (!existing.labels.includes(candidate.connectionLabel)) {
      existing.labels.push(candidate.connectionLabel);
    }
    if (!existing.contexts.includes(candidate.context)) {
      existing.contexts.push(candidate.context);
    }
    if (candidate.priority > existing.priority) {
      existing.priority = candidate.priority;
      existing.group = candidate.group;
    }
  }

  const all = [...aggregated.values()]
    .sort((left, right) => right.priority - left.priority || left.label.localeCompare(right.label))
    .map<ConnectionSummary>((candidate) => ({
      stableId: candidate.stableId,
      kind: candidate.kind,
      label: candidate.label,
      connectionLabel: candidate.labels.join(" · "),
      context: candidate.contexts.join(" "),
      group: candidate.group,
    }));
  const priorityById = new Map(
    [...aggregated.values()].map((candidate) => [candidate.stableId, candidate.priority]),
  );
  const key = all
    .filter(
      (connection) =>
        connection.kind === "person" && (priorityById.get(connection.stableId) ?? 0) >= 40,
    )
    .slice(0, 6);
  const keyIds = new Set(key.map((connection) => connection.stableId));
  const groupOrder: ConnectionGroupId[] = [
    "household",
    "workplace",
    "residence",
    "organizations",
    "places",
  ];
  const groups = groupOrder
    .map((id) => ({
      id,
      label: groupLabels[id],
      items: all.filter((connection) => connection.group === id && !keyIds.has(connection.stableId)),
    }))
    .filter((group) => group.items.length > 0);

  return { key, groups, total: all.length };
}
