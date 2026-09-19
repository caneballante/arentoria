import { describe, expect, it } from "vitest";
import { firstSentence, projectBuildingNarrative, projectPersonNarrative } from "./narrative";

describe("deterministic narrative projection", () => {
  it("turns a staffed business into concise table-ready prose without adding facts", () => {
    const narrative = projectBuildingNarrative({
      title: "Forgotten Key & Broken Seal",
      address: "12 Spice Row",
      district: "Grand Market",
      landUse: "Commercial",
      specificUse: "Relic / antiquities broker",
      residentCount: 0,
      householdCount: 0,
      workplaceName: "Forgotten Key & Broken Seal",
      workplaceLead: "Ketta Stonekeg",
      staff: [
        { name: "Ketta Stonekeg", role: "proprietor", isLead: true },
        { name: "Rill Merryfoot", role: "assistant", isLead: false },
        { name: "Vera Pell", role: "clerk", isLead: false },
        { name: "Yorin Vell", role: "laborer", isLead: false },
      ],
    });

    expect(narrative).toContain("run by Ketta Stonekeg");
    expect(narrative).toContain("Rill Merryfoot (assistant)");
    expect(narrative).not.toContain("fine");
    expect(firstSentence(narrative)).toBe(
      "Forgotten Key & Broken Seal is a relic / antiquities broker at 12 Spice Row, run by Ketta Stonekeg.",
    );
  });

  it("summarizes only recorded person, residence, work, wealth, and faction facts", () => {
    const narrative = projectPersonNarrative({
      name: "Chancellor Algren Vayne",
      age: 54,
      ageBand: "Adult (18–59)",
      ancestry: "Human",
      dailyRole: "office lead",
      homeAddress: "4 Tinker's Hollow",
      residenceType: "Group quarters",
      residenceUnitId: "GQ-0014",
      residenceSize: 6,
      wealthClass: "middling",
      workplaceName: "Chancellor Vayne's Office",
      workplaceAddress: "1 Ministerial Court",
      workplaceDistrict: "Crown Ward",
      workplaceSpecificUse: "Government office / ministry / bureau",
      workplaceRole: "office lead",
      relationships: [
        { name: "Elise Vayne", relationship: "spouse / partner" },
        { name: "Calder Vayne", relationship: "adult child" },
      ],
      factions: [{ name: "Gilded Spur Company", role: "leader / principal" }],
    });

    expect(narrative).toContain("54-year-old Human");
    expect(narrative).toContain("with 5 other residents");
    expect(narrative).toContain(
      "They work at Chancellor Vayne's Office (government office / ministry / bureau) at 1 Ministerial Court in Crown Ward.",
    );
    expect(narrative).toContain("Elise Vayne (spouse / partner)");
    expect(narrative).toContain("Calder Vayne (adult child)");
    expect(narrative).toContain("Gilded Spur Company (leader / principal)");
    expect(narrative).not.toContain("secret");
  });
});
