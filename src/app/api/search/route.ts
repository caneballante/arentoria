import { searchEntities } from "@/lib/data";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ results: searchEntities(query) });
}
