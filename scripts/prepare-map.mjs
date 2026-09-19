import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "Arentoria_master_map.svg");
const outputDirectory = path.join(projectRoot, "public", "generated");
const dataDirectory = path.join(projectRoot, "data", "generated");
const outputPath = path.join(outputDirectory, "arentoria-map.svg");
const indexPath = path.join(dataDirectory, "map-index.json");

const escapeAttribute = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

function pathToPolygon(pathData) {
  const tokens = [...pathData.matchAll(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g)].map(
    (match) => match[0],
  );
  const points = [];
  let command = "";
  let cursor = 0;
  let x = 0;
  let y = 0;

  const number = () => {
    const value = Number(tokens[cursor]);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid path number near token ${cursor}: ${pathData}`);
    }
    cursor += 1;
    return value;
  };

  while (cursor < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[cursor])) {
      command = tokens[cursor];
      cursor += 1;
    }

    if (command === "M") {
      x = number();
      y = number();
      points.push([x, y]);
      command = "L";
    } else if (command === "m") {
      x += number();
      y += number();
      points.push([x, y]);
      command = "l";
    } else if (command === "L") {
      x = number();
      y = number();
      points.push([x, y]);
    } else if (command === "l") {
      x += number();
      y += number();
      points.push([x, y]);
    } else if (command === "H") {
      x = number();
      points.push([x, y]);
    } else if (command === "h") {
      x += number();
      points.push([x, y]);
    } else if (command === "V") {
      y = number();
      points.push([x, y]);
    } else if (command === "v") {
      y += number();
      points.push([x, y]);
    } else if (command === "Z" || command === "z") {
      command = "";
    } else {
      throw new Error(`Unsupported building path command '${command}' in: ${pathData}`);
    }
  }

  return points;
}

function polygonBounds(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function polygonArea(points) {
  return Math.abs(
    points.reduce((sum, [x1, y1], index) => {
      const [x2, y2] = points[(index + 1) % points.length];
      return sum + x1 * y2 - x2 * y1;
    }, 0) / 2,
  );
}

function polygonCentroid(points) {
  let signedArea = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    signedArea += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }

  signedArea /= 2;
  if (Math.abs(signedArea) < 0.0001) {
    const bounds = polygonBounds(points);
    return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
  }

  return [x / (6 * signedArea), y / (6 * signedArea)];
}

function containsPoint(points, [x, y]) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const [currentX, currentY] = points[current];
    const [previousX, previousY] = points[previous];
    const crosses =
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function squaredDistance([x1, y1], [x2, y2]) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

const svg = await readFile(sourcePath, "utf8");

if (/<script\b|<foreignObject\b|<image\b|<use\b|<a\b/i.test(svg)) {
  throw new Error("The source SVG contains active or externally referenced content.");
}

const buildingPaths = [...svg.matchAll(/<path\b[^>]*\bclass="st10"[^>]*\/>/g)].map((match) => {
  const attrs = attributes(match[0]);
  const points = pathToPolygon(attrs.d);
  return {
    sourceTag: match[0],
    pathId: attrs.id,
    pathData: attrs.d,
    points,
    bounds: polygonBounds(points),
    area: polygonArea(points),
    centroid: polygonCentroid(points),
  };
});

const labels = [...svg.matchAll(
  /<g class="st17" data-ar-id="(AR-\d{4})" data-district="([^"]+)">[\s\S]*?<text class="st19" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"/g,
)].map((match) => ({
  stableId: match[1],
  district: match[2],
  labelOrigin: [Number(match[3]), Number(match[4])],
  labelCenter: [Number(match[3]) + 8.5, Number(match[4]) - 3.5],
}));

if (buildingPaths.length !== 1676 || labels.length !== 1676) {
  throw new Error(
    `Expected 1,676 building paths and labels; found ${buildingPaths.length} paths and ${labels.length} labels.`,
  );
}

const duplicateLabels = labels.filter(
  (label, index) => labels.findIndex((candidate) => candidate.stableId === label.stableId) !== index,
);
if (duplicateLabels.length > 0) {
  throw new Error(`Duplicate map IDs: ${duplicateLabels.map((label) => label.stableId).join(", ")}`);
}

const candidateLists = labels.map((label, labelIndex) => {
  const testPoints = [
    label.labelCenter,
    label.labelOrigin,
    [label.labelOrigin[0] + 4, label.labelOrigin[1] - 2],
  ];

  const candidates = buildingPaths
    .map((building, pathIndex) => {
      const contained = testPoints.some((point) => containsPoint(building.points, point));
      const distanceSquared = squaredDistance(building.centroid, label.labelCenter);
      return {
        pathIndex,
        contained,
        distanceSquared,
        score: (contained ? 0 : 100_000) + distanceSquared + building.area / 10_000,
      };
    })
    .filter((candidate) => candidate.contained || Math.sqrt(candidate.distanceSquared) <= 45)
    .sort((left, right) => left.score - right.score);

  if (candidates.length === 0) {
    throw new Error(`No plausible building geometry candidates for ${label.stableId}.`);
  }

  return { labelIndex, candidates };
});

// Resolve the sparse label/path graph as a one-to-one matching. Processing the
// most constrained labels first avoids a nearby label consuming their only path.
const pathOwners = new Map();
const labelAssignments = new Map();

function assignLabel(labelIndex, visitedPaths) {
  for (const candidate of candidateLists[labelIndex].candidates) {
    if (visitedPaths.has(candidate.pathIndex)) continue;
    visitedPaths.add(candidate.pathIndex);
    const currentOwner = pathOwners.get(candidate.pathIndex);
    if (currentOwner === undefined || assignLabel(currentOwner, visitedPaths)) {
      pathOwners.set(candidate.pathIndex, labelIndex);
      labelAssignments.set(labelIndex, candidate);
      return true;
    }
  }
  return false;
}

for (const { labelIndex } of [...candidateLists].sort(
  (left, right) => left.candidates.length - right.candidates.length,
)) {
  if (!assignLabel(labelIndex, new Set())) {
    throw new Error(`Could not produce a one-to-one geometry match for ${labels[labelIndex].stableId}.`);
  }
}

const warnings = [];
const mappings = labels.map((label, labelIndex) => {
  const assignment = labelAssignments.get(labelIndex);
  const building = buildingPaths[assignment.pathIndex];
  const matchMethod = assignment.contained ? "label-contained" : "nearest-centroid";
  if (!assignment.contained) {
    warnings.push(
      `${label.stableId} used nearest-centroid fallback (${Math.sqrt(assignment.distanceSquared).toFixed(2)} map units).`,
    );
  }

  return {
    stableId: label.stableId,
    district: label.district,
    pathId: building.pathId,
    labelOrigin: label.labelOrigin,
    centroid: building.centroid.map((value) => Number(value.toFixed(2))),
    bounds: Object.fromEntries(
      Object.entries(building.bounds).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
    matchMethod,
  };
});

if (pathOwners.size !== buildingPaths.length) {
  throw new Error(`Matched ${pathOwners.size} of ${buildingPaths.length} building paths.`);
}

const mappingByPath = new Map(mappings.map((mapping) => [mapping.pathId, mapping]));
const mapStyle = `
      .arentoria-building {
        cursor: pointer;
        pointer-events: all;
        transition: fill .12s ease, stroke .12s ease, stroke-width .12s ease;
      }
      .arentoria-building:hover,
      .arentoria-building:focus,
      .arentoria-building.is-selected {
        fill: #e8c978;
        fill-opacity: .72;
        outline: none;
        stroke: #3e2f20;
        stroke-width: 3px;
      }
      .arentoria-building.is-dimmed { opacity: .3; }
      #Building_IDs,
      #road_ID_name_review,
      #layer-MC13,
      #layer-MC12,
      #layer-MC9,
      #layer-MC10,
      #layer-MC7,
      #roads_geometry { pointer-events: none; }
`;

let preparedSvg = svg.replace("</style>", `${mapStyle}    </style>`);
preparedSvg = preparedSvg.replace(/<path\b[^>]*\bclass="st10"[^>]*\/>/g, (tag) => {
  const attrs = attributes(tag);
  const mapping = mappingByPath.get(attrs.id);
  if (!mapping) return tag;
  const ariaLabel = `${mapping.stableId}, ${mapping.district}`;
  return tag.replace(
    'class="st10"',
    `class="st10 arentoria-building" data-building-id="${mapping.stableId}" data-district="${escapeAttribute(mapping.district)}" role="button" tabindex="0" aria-label="${escapeAttribute(ariaLabel)}"`,
  );
});
preparedSvg = preparedSvg.replace(
  "<svg ",
  '<svg data-map-prepared="true" aria-label="Interactive map of Arentoria" ',
);

await mkdir(outputDirectory, { recursive: true });
await mkdir(dataDirectory, { recursive: true });
await writeFile(outputPath, preparedSvg, "utf8");
await writeFile(
  indexPath,
  `${JSON.stringify(
    {
      source: path.basename(sourcePath),
      generatedAt: new Date().toISOString(),
      viewBox: [0, 0, 2042.02, 1993.07],
      count: mappings.length,
      fallbackCount: warnings.length,
      warnings,
      buildings: mappings,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Prepared ${mappings.length} interactive building paths.`);
console.log(`Fallback mappings: ${warnings.length}.`);
console.log(`Map: ${path.relative(projectRoot, outputPath)}`);
console.log(`Index: ${path.relative(projectRoot, indexPath)}`);
