import { action } from "./_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";

export const parseWorkout = action({
  args: {
    description: v.string(),
  },
  handler: async (_ctx, args) => {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: `You are a fitness timer configuration parser. Parse natural language workout descriptions into a JSON timer config.

Output ONLY valid JSON — no markdown, no explanation, no code blocks:
{"work":<seconds>,"rest":<seconds>,"rounds":<number>,"sets":<number>,"restBetweenSets":<seconds>,"countdown":"3-2-1"|"single"}

Rules:
- "Tabata" = 20s work, 10s rest, 8 rounds, 1 set
- "EMOM X min" = 60s work, 0s rest, X rounds, 1 set
- "AMRAP" = 60s work, 0s rest, 1 round, 1 set
- Default countdown = "3-2-1"
- Default sets = 1
- Default restBetweenSets = 60 if sets > 1, else 0
- Minimum work = 5s, minimum rest = 0s
- Maximum rounds = 100, maximum sets = 20`,
      messages: [{ role: "user", content: args.description }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      throw new Error(`Claude returned unparseable response: ${text}`);
    }

    // Validate and sanitize
    const work = Math.max(5, Math.min(3600, Number(parsed.work) || 20));
    const rest = Math.max(0, Math.min(3600, Number(parsed.rest) || 10));
    const rounds = Math.max(1, Math.min(100, Number(parsed.rounds) || 8));
    const sets = Math.max(1, Math.min(20, Number(parsed.sets) || 1));
    const restBetweenSets = Math.max(0, Math.min(3600, Number(parsed.restBetweenSets) || 0));
    const countdown = parsed.countdown === "single" ? "single" : "3-2-1";

    return {
      work,
      rest,
      rounds,
      sets,
      restBetweenSets,
      countdown: countdown as "3-2-1" | "single",
      totalSeconds:
        (work + rest) * rounds * sets + restBetweenSets * Math.max(0, sets - 1),
    };
  },
});
