import { CORPUS } from "./truth.ts";
import type { SearchResult } from "./types.ts";

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

export function searchFunctions(q: string, limit = 20, hasDocstring = true): SearchResult {
  const query = tokens(q);
  const hits = CORPUS.filter((fn) => !hasDocstring || fn.docstring.trim().length > 0)
    .map((fn) => {
      const hay = new Set(tokens(`${fn.signature} ${fn.docstring} ${fn.intents.join(" ")} ${fn.path}`));
      const matched = query.filter((t) => hay.has(t));
      const score = query.length ? matched.length / query.length : 0;
      return { id: fn.id, path: fn.path, score, docstring: fn.docstring };
    })
    .filter((hit) => hit.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const top = hits[0];
  const verbatim = top
    ? `Searched lib: q='${q}' → ${hits.length} matches, reusing id=${top.id} from ${top.path}`
    : `Searched lib: q='${q}' → 0 matches`;

  return { q, hitCount: hits.length, hits, verbatim };
}

export interface CollapseCandidate {
  id: string;
  title: string;
  reason: string;
  rank: number;
  hold: string;
}

export function collapseCandidates(): CollapseCandidate[] {
  return [
    {
      id: "vault-a-b",
      title: "Vault A canonical, Vault B legacy",
      reason: "Two credential stores. A is encrypted, PK = service. B is plaintext and allows many usernames.",
      rank: 95,
      hold: "Do not collapse until the duplicate-username preflight returns zero. Then a human migrates.",
    },
    {
      id: "header-case",
      title: "X-Echo-SDK-Token and X-Echo-Sdk-Token",
      reason: "19 + 18 counts are one header under RFC 9110 §5.1. 37 caps.",
      rank: 60,
      hold: "Collapse in the scanner. Do not drop either count.",
    },
    {
      id: "schema-views",
      title: "33-vs-20 count and the Property gap",
      reason: "One schema gap seen two ways. Property is the only unmigrated name in the packet.",
      rank: 75,
      hold: "Do not invent the other model names.",
    },
  ];
}
