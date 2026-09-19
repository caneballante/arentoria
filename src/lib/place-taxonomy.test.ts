import { describe, expect, it } from "vitest";
import { categorizePlaceType, placeCategoryDefinitions } from "./place-taxonomy";

describe("place browser taxonomy", () => {
  it("keeps the browser to six broad categories", () => {
    expect(placeCategoryDefinitions).toHaveLength(6);
    expect(new Set(placeCategoryDefinitions.map((category) => category.id)).size).toBe(6);
  });

  it.each([
    ["Magic-item shop", "adventure-arcane"],
    ["Armorer", "adventure-arcane"],
    ["Tavern / alehouse", "food-lodging"],
    ["General shop / oddments dealer", "shops-trade"],
    ["Blacksmith / farrier", "crafts-industry"],
    ["Advocate / notary / scrivener", "services-transport"],
    ["Temple / chapel", "civic-culture"],
  ])("classifies %s", (specificUse, category) => {
    expect(categorizePlaceType(specificUse)).toBe(category);
  });
});
