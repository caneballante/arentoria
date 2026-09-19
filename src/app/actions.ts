"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { entities, recentViews, sessionPins } from "@/lib/db/schema";
import { getEntityDetail } from "@/lib/data";
import type { StoryProfile } from "@/lib/types";

const storyField = z.string().trim().max(1200).nullable();
const storyProfileSchema = z.object({
  demeanor: storyField,
  wants: storyField,
  knows: storyField,
  secret: storyField,
  currentProblem: storyField,
  recentEvent: storyField,
  memorableDetail: storyField,
  loyalties: storyField,
  dislikes: storyField,
});

async function requireEntity(stableId: string) {
  const { db } = getDatabase();
  const [entity] = await db.select({ stableId: entities.stableId }).from(entities).where(eq(entities.stableId, stableId));
  if (!entity) throw new Error(`Unknown entity '${stableId}'.`);
}

export async function recordRecentView(stableId: string) {
  await requireEntity(stableId);
  const { db } = getDatabase();
  await db
    .insert(recentViews)
    .values({ entityStableId: stableId, viewedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: recentViews.entityStableId,
      set: { viewedAt: new Date().toISOString() },
    });
}

export async function toggleSessionPin(stableId: string) {
  await requireEntity(stableId);
  const { db } = getDatabase();
  const [existing] = await db
    .select({ stableId: sessionPins.entityStableId })
    .from(sessionPins)
    .where(eq(sessionPins.entityStableId, stableId));
  if (existing) {
    await db.delete(sessionPins).where(eq(sessionPins.entityStableId, stableId));
  } else {
    await db.insert(sessionPins).values({ entityStableId: stableId, pinnedAt: new Date().toISOString() });
  }
  revalidatePath("/");
  return { pinned: !existing };
}

export async function saveStoryProfile(stableId: string, input: StoryProfile) {
  await requireEntity(stableId);
  const story = storyProfileSchema.parse(input);
  const { sqlite } = getDatabase();
  const now = new Date().toISOString();
  sqlite
    .prepare(`
      INSERT INTO story_profile (
        entity_stable_id, demeanor, wants, knows, secret, current_problem,
        recent_event, memorable_detail, loyalties, dislikes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_stable_id) DO UPDATE SET
        demeanor = excluded.demeanor,
        wants = excluded.wants,
        knows = excluded.knows,
        secret = excluded.secret,
        current_problem = excluded.current_problem,
        recent_event = excluded.recent_event,
        memorable_detail = excluded.memorable_detail,
        loyalties = excluded.loyalties,
        dislikes = excluded.dislikes,
        updated_at = excluded.updated_at
    `)
    .run(
      stableId,
      story.demeanor,
      story.wants,
      story.knows,
      story.secret,
      story.currentProblem,
      story.recentEvent,
      story.memorableDetail,
      story.loyalties,
      story.dislikes,
      now,
      now,
    );
  revalidatePath("/");
  const detail = getEntityDetail(stableId);
  if (!detail) throw new Error(`Entity '${stableId}' disappeared after its story layer was saved.`);
  return detail;
}
