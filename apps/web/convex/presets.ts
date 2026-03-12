import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// NOTE: Clerk JWT template "convex" must include { "org_id": "{{org.id}}" }
// to propagate org membership into Convex identity claims.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { personal: [], org: [] };

    const userId = identity.subject;
    const orgId = (identity as any).org_id as string | undefined;

    const personal = await ctx.db
      .query("presets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);

    let org: typeof personal = [];
    if (orgId) {
      org = await ctx.db
        .query("presets")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .order("desc")
        .take(20);
    }

    return { personal, org };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    scope: v.union(v.literal("personal"), v.literal("org")),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const userId = identity.subject;
    const orgId = (identity as any).org_id as string | undefined;

    if (args.scope === "org" && !orgId) {
      throw new Error("No active organization");
    }

    const now = Date.now();
    return await ctx.db.insert("presets", {
      userId,
      orgId: args.scope === "org" ? orgId : undefined,
      scope: args.scope,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const preset = await ctx.db.get(args.id);
    if (!preset) throw new Error("Preset not found");

    const userId = identity.subject;
    const orgId = (identity as any).org_id as string | undefined;

    if (preset.scope === "personal" && preset.userId !== userId) {
      throw new Error("Unauthorized");
    }
    if (preset.scope === "org" && preset.orgId !== orgId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.id);
  },
});
