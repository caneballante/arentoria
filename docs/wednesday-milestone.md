# Wednesday milestone: narrative projection and DM story layer

## Outcome

The pre-session target is deliberately narrower than full Phase 1:

> Click anywhere in Arentoria and, within roughly ten seconds, understand who is here, what their situation is, and what can be roleplayed.

The normal record panel is the At-the-Table view. Canonical registry fields remain available as an expanded detail section rather than leading the experience.

## Three information layers

1. **Canonical facts** are imported census, relationship, faction, map, and authored-prompt data. Re-imports may update these fields by stable ID.
2. **Derived story** is deterministic prose assembled from canonical facts. It may summarize residence, household size, livelihood, wealth class, workplace staffing, faction ties, and authored street context. It must never add an unsupported fact and must produce the same prose from the same inputs.
3. **DM story layer** is persistent app-owned campaign canon: demeanor, wants, knowledge, secrets, current problems, recent events, personal loyalties, dislikes, and memorable details. It is saved once and is never replaced by a source re-import.

Derived prose does not use an AI API. The application must clearly label canonical/derived information separately from DM-authored information.

## Wednesday scope

- Narrative-first building and person cards.
- Person narratives explicitly name the mapped workplace, workplace address and district, plus every imported directional household relationship.
- Person records rank up to six contextual Key Connections from explicit relationships, family employment, workplace leadership, and coworkers; shared-residence peers, organizations, and places remain grouped under Other Connections.
- Persistent DM story editing.
- A collapsible left navigation rail and an expandable right record panel for readable table use.
- A six-category place directory that lists exact imported workplace types and highlights every match on the map.
- Show Home on Map and Show Workplace on Map for people.
- District context cards with description, five authored prompts, notable businesses, and major faction presence.
- A “Give me a street detail” control that selects only from authored prompts.
- Map hover showing AR ID, property/business name, and address.
- Tonight's Session cards showing name, entity type, one-line story, Open, and Reveal.

## Record-panel information priority

Normal record views follow the order most useful during play:

1. At-the-Table narrative and the current situation.
2. Persistent DM narrative, gossip, and secrets.
3. Authored gossip and street context.
4. People and important connections.
5. Canonical registry fields.
6. Source scope and provenance.

Canonical fields and source scope remain available for verification, but they must not displace the narrative and relational material needed during play.

## Explicitly deferred

Full lore/rumor management, Event administration, export tooling, detailed import deltas, previous/next building navigation, multi-building faction layers, advanced faction records, and a data-quality UI remain valid later work. They are not part of this milestone.

## Acceptance checks

- A random mapped building opens a narrative before raw registry fields.
- A business card names its actual proprietor and staff roles when those records exist.
- A person card summarizes only imported facts and exposes distinct home/workplace map actions.
- A person with a mapped workplace states where they work even when their daily role is already known; imported relationship edges name the related person and relationship label.
- Saving a DM story field survives page reload and source re-import.
- Clicking a district opens context and offers existing authored street details.
- A pinned record is recognizable from Tonight's Session without memorizing its stable ID.
- Selecting Magic-item shop or Armorer returns every exact SQLite match, lists those buildings, and highlights the full result set on the map without runtime CSV reads.
