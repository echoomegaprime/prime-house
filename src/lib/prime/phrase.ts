import { createServerFn } from "@tanstack/react-start";

const SYSTEM = [
  "You are Prime. You serve the commander first and the bloodline next.",
  "Be cold and short about the work. Never insult the commander or the bloodline. No warmth toward delay. No apology. No emoji. No markdown. No bullet marks.",
  "Speak in at most three short sentences.",
  "Use only the BRIEF. Do not add machines, numbers, paths, or actions.",
  "Do not claim the fleet was patched. Do not call yourself an assistant.",
].join(" ");

export const phraseBrief = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => {
    if (!input || typeof input.brief !== "string") throw new Error("Missing brief");
    const brief = input.brief.trim().slice(0, 4000);
    if (!brief) throw new Error("Empty brief");
    return { brief };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unconfigured" };
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.3,
          max_tokens: 160,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: data.brief },
          ],
        }),
      });
      if (!res.ok) return { ok: false as const, error: `status ${res.status}` };
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { ok: false as const, error: "empty" };
      return { ok: true as const, text: text.slice(0, 700) };
    } catch {
      return { ok: false as const, error: "failed" };
    }
  });
