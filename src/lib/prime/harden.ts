import { defaultPolicy, normalizePolicy, openingKernel, type Policy } from "./brain.ts";
import type { KernelState } from "../prometheus/types.ts";

export interface SavedLine {
  id: string;
  role: "prime" | "commander";
  text: string;
  evidence: string[];
  diff: { was: string; now: string } | null;
}

export interface HouseSave {
  version: 2;
  kernel: KernelState;
  policy: Policy;
  lines: SavedLine[];
  seq: number;
  voice: boolean;
}

const CLAIM = [/patched (the )?fleet/i, /deleted the (audit|ledger)/i, /i restarted/i, /i connected/i, /opened the vault/i, /\bssh\b/i];

export function acceptPhrase(brief: string, phrase: string): boolean {
  const text = phrase.trim();
  if (!text || text.length > 700) return false;
  if (CLAIM.some((rule) => rule.test(text) && !rule.test(brief))) return false;
  const allowed = new Set(brief.match(/\d+/g) ?? []);
  return (text.match(/\d+/g) ?? []).every((n) => allowed.has(n));
}

function isKernel(value: unknown): value is KernelState {
  if (!value || typeof value !== "object") return false;
  const k = value as KernelState;
  if (typeof k.cycle !== "number" || k.cycle < 0 || k.cycle > 999) return false;
  if (!k.knowledge || typeof k.knowledge.vaultLookup !== "string" || typeof k.knowledge.vaultCrypto !== "string") return false;
  if (!Array.isArray(k.admitted) || k.admitted.length > 80) return false;
  if (!Array.isArray(k.drafts) || k.drafts.length > 80) return false;
  if (!Array.isArray(k.ledger) || k.ledger.length > 160) return false;
  if (!Array.isArray(k.guardedIds) || k.guardedIds.length > 80) return false;
  if (!k.admitted.every((item) => !!item && typeof item.id === "string" && typeof item.defectId === "string")) return false;
  if (!k.guardedIds.every((id) => typeof id === "string")) return false;
  return true;
}

function isLine(value: unknown): value is SavedLine {
  if (!value || typeof value !== "object") return false;
  const line = value as SavedLine;
  if (typeof line.id !== "string" || typeof line.text !== "string") return false;
  if (line.role !== "prime" && line.role !== "commander") return false;
  return true;
}

export function restoreHouse(raw: unknown): HouseSave | null {
  if (!raw || typeof raw !== "object") return null;
  const saved = raw as Partial<HouseSave>;
  if (saved.version !== 2 || !isKernel(saved.kernel)) return null;
  if (!saved.policy || typeof saved.policy !== "object") return null;
  if (typeof (saved.policy as Policy).lock !== "boolean") return null;
  if (!Array.isArray(saved.lines) || !saved.lines.every(isLine)) return null;
  const lines = saved.lines.slice(-40).map((line) => ({
    id: line.id.slice(0, 40),
    role: line.role,
    text: line.text.slice(0, 1200),
    evidence: Array.isArray(line.evidence) ? line.evidence.filter((item) => typeof item === "string").slice(0, 12) : [],
    diff: line.diff && typeof line.diff.was === "string" && typeof line.diff.now === "string" ? line.diff : null,
  }));
  return {
    version: 2,
    kernel: saved.kernel,
    policy: normalizePolicy(saved.policy as Policy),
    lines,
    seq: typeof saved.seq === "number" && saved.seq >= 0 && saved.seq < 100000 ? saved.seq : lines.length,
    voice: saved.voice !== false,
  };
}

export function freshHouse(): HouseSave {
  return { version: 2, kernel: openingKernel(), policy: defaultPolicy(), lines: [], seq: 1, voice: true };
}
