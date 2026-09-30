export const DRIVES = ["O:\\", "I:\\", "J:\\", "H:\\", "P:\\", "X:\\", "Downloads"];

export interface KeptNote {
  name: string;
  text: string;
  score: number;
  stamp: number;
}

export interface Incoming {
  name: string;
  text: string;
}

export interface AbsorbResult {
  notes: KeptNote[];
  summary: string;
  evidence: string[];
}

const TEXT = /\.(txt|md|markdown|json|csv|log|ts|tsx|js|py|yml|yaml|toml|sql|html|css|rs|go)$/i;
const BLOCKED = /(^|\/)(\.env|id_rsa|credentials|secrets)(\.|$)|(\.(pem|key|p12|pfx|kdbx))$/i;

export function mayRead(name: string): boolean {
  const base = name.split(/[/\\]/).pop() ?? name;
  if (BLOCKED.test(base) || BLOCKED.test(name)) return false;
  return TEXT.test(base);
}

export function scoreText(text: string): number {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 40) return 0;
  let score = Math.min(4, Math.floor(clean.length / 80));
  if (/[A-Za-z]:\\/.test(clean) || /\/home\/forge/.test(clean)) score += 3;
  if (/\b(todo|fixme|defect|ledger|decision|invariant)\b/i.test(clean)) score += 2;
  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(clean)) score += 1;
  return score;
}

export function absorbBatch(
  existing: KeptNote[],
  incoming: Incoming[],
  isSecret: (text: string) => boolean,
  now = 0,
): AbsorbResult {
  const notes = existing.filter((note) => !isSecret(note.text)).slice(-24);
  let secrets = 0;
  let skipped = 0;
  let kept = 0;
  for (const file of incoming) {
    if (!mayRead(file.name) || file.text.includes("\u0000")) {
      skipped += 1;
      continue;
    }
    if (isSecret(file.text) || isSecret(file.name)) {
      secrets += 1;
      continue;
    }
    const score = scoreText(file.text);
    if (score < 3) {
      skipped += 1;
      continue;
    }
    const note: KeptNote = {
      name: file.name.split(/[/\\]/).pop()?.slice(0, 120) || "note",
      text: file.text.replace(/\s+/g, " ").trim().slice(0, 400),
      score,
      stamp: now,
    };
    const index = notes.findIndex((item) => item.name === note.name);
    if (index >= 0) {
      if (note.score >= notes[index].score) notes[index] = note;
    } else {
      notes.push(note);
    }
    kept += 1;
  }
  notes.sort((a, b) => b.score - a.score);
  const capped = notes.slice(0, 24);
  const summary =
    incoming.length === 0
      ? "Nothing in that grant."
      : `Read ${incoming.length}. Kept ${kept}. Dropped ${secrets} secrets. Dropped ${skipped} low-signal. ${capped.length} notes on the board.`;
  return {
    notes: capped,
    summary,
    evidence: capped.slice(0, 8).map((note) => `${note.name} — ${note.score}`),
  };
}

export function analyzeNotes(notes: KeptNote[]): { reply: string; evidence: string[] } {
  if (notes.length === 0) {
    return {
      reply: "No notes yet. HAMMER's drives are not mounted from this page. Grant a folder and I will keep what is worth keeping.",
      evidence: DRIVES.map((drive) => `${drive} — not mounted`),
    };
  }
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const word of note.text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? []) {
      if (STOP.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => `${word} ${count}`);
  const best = [...notes].sort((a, b) => b.score - a.score)[0];
  return {
    reply: `${notes.length} notes. Strongest is ${best.name}, score ${best.score}. I kept what scored and dropped the rest.`,
    evidence: [best.text, ...top],
  };
}

const STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "were",
  "they",
  "them",
  "your",
  "into",
  "about",
  "there",
  "their",
  "would",
  "could",
  "should",
  "which",
  "when",
  "what",
  "where",
  "been",
  "will",
  "just",
  "only",
  "also",
  "than",
  "then",
  "note",
  "text",
  "file",
]);
