import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  presets: defineTable({
    userId: v.optional(v.string()),
    name: v.string(),
    description: v.string(),
    config: v.object({
      work: v.number(),
      rest: v.number(),
      rounds: v.number(),
      sets: v.number(),
      restBetweenSets: v.number(),
      countdown: v.union(v.literal("3-2-1"), v.literal("single")),
      totalSeconds: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),
});
