export const placeCategoryDefinitions = [
  {
    id: "adventure-arcane",
    label: "Adventuring & Arcane",
    description: "Magic, equipment, weapons, guards, and expedition work",
  },
  {
    id: "food-lodging",
    label: "Food, Drink & Lodging",
    description: "Meals, provisions, taverns, inns, and rooming houses",
  },
  {
    id: "shops-trade",
    label: "Shops & Trade",
    description: "Merchants, dealers, brokers, and specialist sellers",
  },
  {
    id: "crafts-industry",
    label: "Crafts & Industry",
    description: "Makers, workshops, processing yards, and heavy trades",
  },
  {
    id: "services-transport",
    label: "Services & Transport",
    description: "Professional, personal, financial, and transport services",
  },
  {
    id: "civic-culture",
    label: "Civic, Faith & Culture",
    description: "Government, learning, worship, security, and entertainment",
  },
] as const;

export type PlaceCategoryId = (typeof placeCategoryDefinitions)[number]["id"];

const categoryPatterns: Array<{
  id: PlaceCategoryId;
  patterns: RegExp[];
}> = [
  {
    id: "adventure-arcane",
    patterns: [
      /adventur/i,
      /alchemical/i,
      /apothecary/i,
      /armorer/i,
      /bowyer|fletcher/i,
      /fighting|performance yard/i,
      /herbalist/i,
      /magic-item/i,
      /private guard|security company/i,
      /relic|antiquities/i,
      /spell|scroll|spellbook/i,
      /weaponsmith|cutler/i,
    ],
  },
  {
    id: "food-lodging",
    patterns: [
      /tavern|alehouse/i,
      /bakery/i,
      /cookshop|eating house/i,
      /boarding|rooming house/i,
      /butcher/i,
      /grocer|produce seller/i,
      /^inn$/i,
      /brewery/i,
      /spice|provisions/i,
      /confectioner|pastry/i,
      /dairy|cheesemonger/i,
      /fishmonger/i,
      /wine|spirits merchant/i,
    ],
  },
  {
    id: "crafts-industry",
    patterns: [
      /blacksmith|farrier/i,
      /tailor|seamstress/i,
      /cobbler/i,
      /carpenter|joiner/i,
      /mason|builder|stonecutter/i,
      /chandler|soapmaker/i,
      /cooper/i,
      /saddler|harness maker/i,
      /weaving|spinning/i,
      /brick kiln|charcoal yard/i,
      /dyer|fuller/i,
      /potter/i,
      /rope|basket|broom works/i,
      /tannery/i,
      /wheelwright|cartwright/i,
      /copper|tin|brass worker/i,
      /locksmith/i,
      /slaughterhouse/i,
      /cabinetmaker|fine furniture/i,
      /glazier/i,
      /glue|bone-processing/i,
      /glassworks/i,
      /knacker/i,
      /^mill$/i,
      /parchment|fine leather works/i,
      /refuse|night-soil/i,
      /rendering works/i,
    ],
  },
  {
    id: "services-transport",
    patterns: [
      /advocate|notary|scrivener/i,
      /bank|moneychanger|counting house/i,
      /laundry|washhouse/i,
      /cartage|caravan company/i,
      /stable|livery/i,
      /physician|healer/i,
      /property agent|broker|insurer/i,
      /barber-surgeon/i,
      /bathhouse/i,
      /barber|grooming shop/i,
      /courier|messenger/i,
      /undertaker|funeral/i,
      /midwife/i,
    ],
  },
  {
    id: "civic-culture",
    patterns: [
      /government office|ministry|bureau/i,
      /guild hall|guild office/i,
      /school|tutoring/i,
      /temple|chapel|shrine|monastery/i,
      /college|academy|scholarly institute/i,
      /watch house|gate guard/i,
      /barracks|military administrative/i,
      /charitable house|kitchen/i,
      /theater|music hall/i,
      /library|archive/i,
      /jail|detention/i,
      /gaming house/i,
      /brothel/i,
    ],
  },
];

export function categorizePlaceType(specificUse: string): PlaceCategoryId {
  return (
    categoryPatterns.find((category) =>
      category.patterns.some((pattern) => pattern.test(specificUse)),
    )?.id ?? "shops-trade"
  );
}
