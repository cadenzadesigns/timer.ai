import { action } from "./_generated/server";
import { v } from "convex/values";

export const parseWorkout = action({
  args: {
    description: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable not set — set it via `npx convex env set ANTHROPIC_API_KEY <key>`");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: `You are a fitness timer configuration parser. Parse natural language workout descriptions into a JSON timer config.

Output ONLY valid JSON — no markdown, no explanation, no code blocks:
{"work":<seconds>,"rest":<seconds>,"rounds":<number>,"sets":<number>,"restBetweenSets":<seconds>,"countdown":"3-2-1"|"single"}

Rules:
- Parse EXACTLY what the user says. Do NOT add defaults the user didn't ask for.
- If the user says "no rest" or doesn't mention rest, set rest to 0.
- If the user doesn't mention sets, set sets to 1.
- If the user doesn't mention rest between sets, set restBetweenSets to 0.
- Only use these presets when the user explicitly names them:
  - "Tabata" = 20s work, 10s rest, 8 rounds, 1 set
  - "EMOM X min" = 60s work, 0s rest, X rounds, 1 set
- Default countdown = "3-2-1"
- Minimum work = 5s, minimum rest = 0s
- Maximum rounds = 100, maximum sets = 20
- If the user mentions a specific total workout duration (e.g. "10 minutes", "20 min", "half hour", "for 15 minutes"), also include "requestedTotalSeconds":<number>. If no total duration is mentioned, omit this field entirely.`,
        messages: [{ role: "user", content: args.description }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errText}`);
    }

    const data = await response.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content[0]?.type === "text" ? data.content[0].text ?? "" : "";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      throw new Error(`Claude returned unparseable response: ${text}`);
    }

    // Validate and sanitize — use nullish coalescing (??) not || to preserve 0 values
    const work = Math.max(5, Math.min(3600, Number(parsed.work ?? 20)));
    const rest = Math.max(0, Math.min(3600, Number(parsed.rest ?? 0)));
    const rounds = Math.max(1, Math.min(100, Number(parsed.rounds ?? 1)));
    const sets = Math.max(1, Math.min(20, Number(parsed.sets ?? 1)));
    const restBetweenSets = Math.max(0, Math.min(3600, Number(parsed.restBetweenSets ?? 0)));
    const countdown = parsed.countdown === "single" ? "single" : "3-2-1";
    const requestedTotalSeconds = parsed.requestedTotalSeconds != null
      ? Math.max(1, Math.min(7200, Number(parsed.requestedTotalSeconds)))
      : undefined;

    return {
      work,
      rest,
      rounds,
      sets,
      restBetweenSets,
      countdown: countdown as "3-2-1" | "single",
      totalSeconds:
        (work + rest) * rounds * sets + restBetweenSets * Math.max(0, sets - 1),
      ...(requestedTotalSeconds !== undefined ? { requestedTotalSeconds } : {}),
    };
  },
});
