import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("presets")
      .withIndex("by_created")
      .order("desc")
      .take(20);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    config: v.object({
      work: v.number(),
      rest: v.number(),
      rounds: v.number(),
      sets: v.number(),
      restBetweenSets: v.number(),
      countdown: v.union(v.literal("3-2-1"), v.literal("single")),
      infinite: v.boolean(),
      totalSeconds: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("presets", {
      name: args.name,
      description: args.description,
      config: args.config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("presets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
