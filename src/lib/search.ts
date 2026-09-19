export function normalizeSearchQuery(input: string) {
  return input
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" AND ");
}
