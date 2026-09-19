import { describe, expect, it } from "vitest";
import { buildPersonConnections, type ConnectionCandidate } from "./connections";

const candidate = (
  overrides: Partial<ConnectionCandidate> & Pick<ConnectionCandidate, "stableId" | "label">,
): ConnectionCandidate => ({
  kind: "person",
  connectionLabel: "Coworker",
  context: "Works at the same workplace.",
  group: "workplace",
  priority: 40,
  ...overrides,
});

describe("person connection ranking", () => {
  it("ranks explicit relationships and workplace leads before ordinary coworkers", () => {
    const connections = buildPersonConnections([
      candidate({ stableId: "P-3", label: "Cora", priority: 40 }),
      candidate({
        stableId: "P-1",
        label: "Aren",
        connectionLabel: "Spouse / partner",
        context: "Explicit census relationship.",
        group: "household",
        priority: 100,
      }),
      candidate({
        stableId: "P-2",
        label: "Beren",
        connectionLabel: "Workplace lead",
        context: "Leads the same workplace.",
        priority: 75,
      }),
    ]);

    expect(connections.key.map((connection) => connection.stableId)).toEqual(["P-1", "P-2", "P-3"]);
  });

  it("combines evidence for the same person without duplicating them", () => {
    const connections = buildPersonConnections([
      candidate({ stableId: "P-1", label: "Aren" }),
      candidate({
        stableId: "P-1",
        label: "Aren",
        connectionLabel: "Sibling",
        context: "Explicit census relationship.",
        group: "household",
        priority: 100,
      }),
    ]);

    expect(connections.total).toBe(1);
    expect(connections.key[0].connectionLabel).toBe("Coworker · Sibling");
    expect(connections.key[0].context).toContain("Works at the same workplace.");
    expect(connections.key[0].context).toContain("Explicit census relationship.");
  });

  it("keeps shared-residence peers and non-person entities in grouped other connections", () => {
    const connections = buildPersonConnections([
      candidate({
        stableId: "P-1",
        label: "Aren",
        connectionLabel: "Shared residence",
        context: "Shares a group quarter.",
        group: "residence",
        priority: 20,
      }),
      candidate({
        stableId: "FAC-1",
        label: "Gilded Spur Company",
        kind: "faction",
        connectionLabel: "Active member",
        context: "Recorded faction membership.",
        group: "organizations",
        priority: 10,
      }),
    ]);

    expect(connections.key).toHaveLength(0);
    expect(connections.groups.map((group) => group.label)).toEqual([
      "Shared residence",
      "Organizations",
    ]);
  });
});
