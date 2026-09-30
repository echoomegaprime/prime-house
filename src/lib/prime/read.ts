import { createServerFn } from "@tanstack/react-start";
import { ipIsPublic, publicUrl } from "./net.ts";

export interface ReadResult {
  ok: true;
  source: string;
  text: string;
}

export interface ReadError {
  ok: false;
  error: string;
}

async function resolvedPublic(hostname: string): Promise<boolean> {
  if (!hostname.includes(".") && !hostname.includes(":")) return false;
  const { lookup } = await import("node:dns/promises");
  const found = await lookup(hostname, { all: true });
  return found.length > 0 && found.every((row) => ipIsPublic(row.address));
}

async function pull(url: string, hops = 0): Promise<ReadResult | ReadError> {
  const clean = publicUrl(url);
  if (!clean) return { ok: false, error: "That address is not on the public internet." };
  const parsed = new URL(clean);
  if (!(await resolvedPublic(parsed.hostname))) {
    return { ok: false, error: "That host does not resolve to the public internet." };
  }
  const res = await fetch(clean, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "text/html, text/plain, application/json", "User-Agent": "PrimeHouse/1.0" },
  });
  if (res.status >= 300 && res.status < 400) {
    const next = res.headers.get("location");
    if (!next || hops >= 2) return { ok: false, error: "Too many redirects." };
    return pull(new URL(next, clean).toString(), hops + 1);
  }
  if (!res.ok) return { ok: false, error: `The page returned ${res.status}.` };
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (type && !/text\/|json|xml|javascript/.test(type)) return { ok: false, error: "That response is not text." };
  const raw = await readCapped(res, 160_000);
  const text = toText(raw, type);
  if (text.length < 40) return { ok: false, error: "The page had nothing I could keep." };
  return { ok: true, source: clean, text };
}

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    chunks.push(step.value);
  }
  await reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, buf.length - offset);
    buf.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

function toText(raw: string, type: string): string {
  let text = raw;
  if (type.includes("html") || /<\w+[^>]*>/.test(raw.slice(0, 400))) {
    text = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    text = text.replace(/<[^>]+>/g, " ");
    text = text
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function learnTopic(topic: string): Promise<ReadResult | ReadError> {
  const q = topic.replace(/[^\w\s.'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return { ok: false, error: "Learn what?" };
  const search = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json`,
    { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json", "User-Agent": "PrimeHouse/1.0" } },
  );
  if (search.ok) {
    const body = (await search.json()) as { query?: { search?: { title?: string; snippet?: string }[] } };
    const hit = body.query?.search?.[0];
    if (hit?.title) {
      const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json", "User-Agent": "PrimeHouse/1.0" },
      });
      if (summary.ok) {
        const page = (await summary.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } }; type?: string };
        const extract = (page.extract ?? "").replace(/\s+/g, " ").trim();
        if (page.type !== "disambiguation" && extract.length >= 40) {
          const source = page.content_urls?.desktop?.page && publicUrl(page.content_urls.desktop.page)
            ? page.content_urls.desktop.page
            : `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`;
          return { ok: true, source, text: extract.slice(0, 500) };
        }
      }
      const snippet = (hit.snippet ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (snippet.length >= 40) {
        return { ok: true, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`, text: snippet.slice(0, 500) };
      }
    }
  }
  const ddg = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json", "User-Agent": "PrimeHouse/1.0" },
  });
  if (ddg.ok) {
    const body = (await ddg.json()) as { AbstractText?: string; AbstractURL?: string };
    const abstract = (body.AbstractText ?? "").replace(/\s+/g, " ").trim();
    if (abstract.length >= 40) {
      const source = body.AbstractURL && publicUrl(body.AbstractURL) ? body.AbstractURL : `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
      return { ok: true, source, text: abstract.slice(0, 500) };
    }
  }
  return { ok: false, error: "No public page for that." };
}

export const readPublic = createServerFn({ method: "POST" })
  .validator((input: { target: string }) => {
    if (!input || typeof input.target !== "string") throw new Error("Missing target");
    const target = input.target.trim().slice(0, 300);
    if (!target) throw new Error("Empty target");
    return { target };
  })
  .handler(async ({ data }): Promise<ReadResult | ReadError> => {
    try {
      if (/^https?:\/\//i.test(data.target)) return await pull(data.target);
      return await learnTopic(data.target);
    } catch {
      return { ok: false, error: "The read failed." };
    }
  });
