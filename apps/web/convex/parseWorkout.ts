import { action } from "./_generated/server";
import { v } from "convex/values";

const SYSTEM_PROMPT = `You are a fitness timer configuration parser. Parse natural language workout descriptions into a JSON timer config.

Output ONLY valid JSON — no markdown, no explanation, no code blocks:
{"name":<string>,"work":<seconds>,"rest":<seconds>,"rounds":<number>,"sets":<number>,"restBetweenSets":<seconds>,"countdown":"3-2-1"|"single","infinite":<boolean>}

The "name" field is a short, human-readable label for this workout (max 40 chars). Examples:
- "Tabata Classic" for standard Tabata
- "30s on / 10s off × 8" for interval work
- "Every 10s, no rest" for infinite loops
- "2min work / 1min rest × 5, 3 sets" for multi-set
Make it concise but descriptive — like a label you'd see on a preset button.

Rules:
- Parse EXACTLY what the user says. Do NOT add defaults the user didn't ask for.
- If the user says "no rest" or doesn't mention rest, set rest to 0.
- If the user doesn't mention sets, set sets to 1.
- If the user doesn't mention rest between sets, set restBetweenSets to 0.
- Only use these presets when the user explicitly names them:
  - "Tabata" = 20s work, 10s rest, 8 rounds, 1 set
  - "EMOM X min" = 60s work, 0s rest, X rounds, 1 set
- If the user says "every X seconds", "repeat", "until I stop", "go until stopped", "loop", "continuous", or doesn't specify rounds, set "infinite":true and "rounds":1
- Default countdown = "3-2-1"
- Default infinite = false
- Minimum work = 5s, minimum rest = 0s
- Maximum rounds = 100, maximum sets = 20
- If the user mentions a specific total workout duration (e.g. "10 minutes", "20 min", "half hour", "for 15 minutes"), also include "requestedTotalSeconds":<number>. If no total duration is mentioned, omit this field entirely.`;

export const parseWorkout = action({
  args: {
    description: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable not set — set it via `npx convex env set OPENAI_API_KEY <key>`");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        max_tokens: 512,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: args.description },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content ?? "";

    let parsed: Record<string, unknown>;
    try {
      // Strip markdown code blocks if present
      const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM returned unparseable response: ${text}`);
    }

    // Validate and sanitize — use nullish coalescing (??) not || to preserve 0 values
    const work = Math.max(5, Math.min(3600, Number(parsed.work ?? 20)));
    const rest = Math.max(0, Math.min(3600, Number(parsed.rest ?? 0)));
    const rounds = Math.max(1, Math.min(100, Number(parsed.rounds ?? 1)));
    const sets = Math.max(1, Math.min(20, Number(parsed.sets ?? 1)));
    const restBetweenSets = Math.max(0, Math.min(3600, Number(parsed.restBetweenSets ?? 0)));
    const countdown = parsed.countdown === "single" ? "single" : "3-2-1";
    const infinite = parsed.infinite === true;
    const name = typeof parsed.name === "string" ? parsed.name.slice(0, 60) : "";
    const requestedTotalSeconds = parsed.requestedTotalSeconds != null
      ? Math.max(1, Math.min(7200, Number(parsed.requestedTotalSeconds)))
      : undefined;

    return {
      name,
      work,
      rest,
      rounds,
      sets,
      restBetweenSets,
      countdown: countdown as "3-2-1" | "single",
      infinite,
      totalSeconds: infinite ? -1 :
        (work + rest) * rounds * sets + restBetweenSets * Math.max(0, sets - 1),
      ...(requestedTotalSeconds !== undefined ? { requestedTotalSeconds } : {}),
    };
  },
});
