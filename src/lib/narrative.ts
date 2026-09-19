export type NarrativeStaffMember = {
  name: string;
  role: string | null;
  isLead: boolean;
};

export type NarrativeFaction = {
  name: string;
  role: string | null;
};

export type NarrativeRelationship = {
  name: string;
  relationship: string;
};

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function naturalList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function lowerFirst(value: string) {
  return value.length > 0 ? value[0].toLowerCase() + value.slice(1) : value;
}

export function projectBuildingNarrative(input: {
  title: string;
  address: string | null;
  district: string;
  landUse: string | null;
  specificUse: string | null;
  residentCount: number;
  householdCount: number;
  workplaceName: string | null;
  workplaceLead: string | null;
  staff: NarrativeStaffMember[];
}) {
  const place = input.address ? ` at ${input.address}` : ` in ${input.district}`;
  const parts: string[] = [];

  if (input.workplaceName) {
    const use = input.specificUse ? lowerFirst(input.specificUse) : "workplace";
    const lead = input.workplaceLead ? `, run by ${input.workplaceLead}` : "";
    parts.push(sentence(`${input.title} is a ${use}${place}${lead}`));
    if (input.staff.length > 0 && input.staff.length <= 6) {
      const staff = input.staff.map((member) =>
        member.role ? `${member.name} (${lowerFirst(member.role)})` : member.name,
      );
      parts.push(sentence(`${input.staff.length} people work here: ${naturalList(staff)}`));
    } else if (input.staff.length > 0) {
      parts.push(sentence(`${input.staff.length} people work here`));
    }
  } else {
    const use = input.specificUse ?? input.landUse;
    parts.push(
      sentence(
        use
          ? `${input.title} is recorded as ${lowerFirst(use)}${place}`
          : `${input.title} stands${place}`,
      ),
    );
  }

  if (input.residentCount > 0) {
    const householdText =
      input.householdCount > 0
        ? ` across ${input.householdCount} household${input.householdCount === 1 ? "" : "s"}`
        : "";
    parts.push(
      sentence(
        `${input.residentCount} resident${input.residentCount === 1 ? " lives" : "s live"} here${householdText}`,
      ),
    );
  }

  return parts.join(" ");
}

export function projectPersonNarrative(input: {
  name: string;
  age: number | null;
  ageBand: string | null;
  ancestry: string | null;
  dailyRole: string | null;
  homeAddress: string | null;
  residenceType: string | null;
  residenceUnitId: string | null;
  residenceSize: number | null;
  wealthClass: string | null;
  workplaceName: string | null;
  workplaceAddress: string | null;
  workplaceDistrict: string | null;
  workplaceSpecificUse: string | null;
  workplaceRole: string | null;
  relationships: NarrativeRelationship[];
  factions: NarrativeFaction[];
}) {
  const identityParts = [
    input.age ? `${input.age}-year-old` : input.ageBand ? lowerFirst(input.ageBand) : null,
    input.ancestry,
  ].filter(Boolean);
  const role = input.dailyRole ? ` who works as ${lowerFirst(input.dailyRole)}` : "";
  const parts = [
    sentence(
      identityParts.length > 0
        ? `${input.name} is a ${identityParts.join(" ")}${role}`
        : `${input.name}${role ? ` is someone${role}` : " is an Arentoria resident"}`,
    ),
  ];

  if (input.homeAddress) {
    const residence = input.residenceType ? ` in ${lowerFirst(input.residenceType)}` : "";
    const size =
      input.residenceSize && input.residenceSize > 1
        ? ` with ${input.residenceSize - 1} other resident${input.residenceSize === 2 ? "" : "s"}`
        : "";
    parts.push(sentence(`They live at ${input.homeAddress}${residence}${size}`));
  }

  if (input.workplaceName) {
    const use = input.workplaceSpecificUse
      ? ` (${lowerFirst(input.workplaceSpecificUse)})`
      : "";
    const address = input.workplaceAddress ? ` at ${input.workplaceAddress}` : "";
    const district = input.workplaceDistrict ? ` in ${input.workplaceDistrict}` : "";
    const workRole =
      input.workplaceRole && input.workplaceRole.toLocaleLowerCase() !== input.dailyRole?.toLocaleLowerCase()
        ? ` as ${lowerFirst(input.workplaceRole)}`
        : "";
    parts.push(
      sentence(`They work at ${input.workplaceName}${use}${address}${district}${workRole}`),
    );
  }

  if (input.relationships.length > 0) {
    const relationships = input.relationships.map(
      (relationship) => `${relationship.name} (${lowerFirst(relationship.relationship)})`,
    );
    parts.push(
      sentence(`Their recorded household relationships are ${naturalList(relationships)}`),
    );
  }

  if (input.wealthClass) {
    parts.push(sentence(`The census records their wealth class as ${lowerFirst(input.wealthClass)}`));
  }

  if (input.factions.length > 0) {
    const memberships = input.factions.map((faction) =>
      faction.role ? `${faction.name} (${lowerFirst(faction.role)})` : faction.name,
    );
    parts.push(sentence(`Their recorded faction ties are ${naturalList(memberships)}`));
  }

  return parts.join(" ");
}

export function firstSentence(value: string) {
  const match = value.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? value).trim();
}
