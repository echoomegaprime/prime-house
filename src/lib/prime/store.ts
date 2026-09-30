import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { hear, defaultPolicy, looksLikeSecret, openingKernel, type Policy } from "./brain.ts";
import { absorbBatch, type Incoming } from "./absorb.ts";
import { acceptPhrase, restoreHouse, type HouseSave } from "./harden.ts";
import { phraseBrief } from "./phrase.ts";
import { readPublic } from "./read.ts";
import type { KernelState } from "../prometheus/types.ts";
import type { Diff } from "./brain.ts";

export interface Line {
  id: string;
  role: "prime" | "commander";
  text: string;
  evidence: string[];
  diff: Diff | null;
}

interface Store {
  kernel: KernelState;
  policy: Policy;
  lines: Line[];
  seq: number;
  hydrated: boolean;
  pending: boolean;
  voice: boolean;
  checks: number;
  capNoted: boolean;
  watchIndex: number;
  send: (text: string) => Promise<void>;
  absorb: (incoming: Incoming[], grantName: string) => void;
  tickWatch: () => Promise<void>;
  setVoice: (voice: boolean) => void;
}

const greeting: Line = {
  id: "g0",
  role: "prime",
  text: "Prime. I serve the commander and the bloodline. The watch is armed. Hand me a URL or a subject. I don't open private hosts, and I have not touched the fleet.",
  evidence: [],
  diff: null,
};

let phraseToken = 0;
let reading = false;
const WATCH_CAP = 120;

function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1;
  utter.pitch = 0.9;
  window.speechSynthesis.speak(utter);
}

type PrimeSet = (partial: Partial<Store> | ((state: Store) => Partial<Store>)) => void;

function writeLine(set: PrimeSet, get: () => Store, text: string, lineId: string | null) {
  if (lineId) {
    set((state) => ({
      lines: state.lines.map((line) => (line.id === lineId ? { ...line, text } : line)),
    }));
    return;
  }
  const seq = get().seq;
  const line: Line = { id: `w${seq}`, role: "prime", text, evidence: [], diff: null };
  set({ lines: [...get().lines, line].slice(-40), seq: seq + 1 });
}

function keepLesson(set: PrimeSet, get: () => Store, source: string, text: string): string | null {
  if (looksLikeSecret(text) || looksLikeSecret(source)) return "I read it and threw it away. It looked like a secret.";
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 500);
  if (clean.length < 40) return "The page had nothing I could keep.";
  const previous = [...get().policy.lessons].reverse().find((lesson) => lesson.source === source);
  if (previous && previous.text === clean) return null;
  const lessons = [...get().policy.lessons, { source, text: clean, stamp: Date.now() }].slice(-12);
  set({ policy: { ...get().policy, lessons } });
  return clean;
}

async function pull(set: PrimeSet, get: () => Store, target: string, lineId: string | null) {
  if (reading) return;
  reading = true;
  try {
    const result = await readPublic({ data: { target } });
    if (!get().policy.online) return;
    if (!result.ok) {
      writeLine(set, get, result.error, lineId);
      return;
    }
    const kept = keepLesson(set, get, result.source, result.text);
    if (!kept) {
      if (lineId) writeLine(set, get, "Unchanged since the last read.", lineId);
      return;
    }
    if (lineId === null && get().policy.night) return;
    const spoken = `Learned from ${result.source}. ${kept}`;
    writeLine(set, get, spoken, lineId);
    speak(spoken, get().voice);
  } catch {
    if (lineId) writeLine(set, get, "The read failed.", lineId);
  } finally {
    reading = false;
  }
}

async function tick(set: PrimeSet, get: () => Store) {
  const state = get();
  if (state.policy.online && state.policy.watch) {
    const list = [...state.policy.queue, ...(state.policy.topic ? [state.policy.topic] : [])];
    if (list.length > 0 && state.checks >= WATCH_CAP) {
      if (!state.capNoted) {
        const text = "Watch cap reached for this page. Say keep learning.";
        writeLine(set, get, text, null);
        set({ capNoted: true });
        speak(text, get().voice);
      }
    } else if (list.length > 0) {
      const target = list[state.watchIndex % list.length];
      set({ checks: state.checks + 1, watchIndex: state.watchIndex + 1 });
      await pull(set, get, target, null);
    }
  }
  serveDuty(set, get);
}

function estateMoved(before: KernelState, after: KernelState): boolean {
  return (
    before.ledger.length !== after.ledger.length ||
    before.drafts.length !== after.drafts.length ||
    before.admitted.length !== after.admitted.length ||
    before.knowledge.vaultLookup !== after.knowledge.vaultLookup ||
    before.knowledge.vaultCrypto !== after.knowledge.vaultCrypto
  );
}

function serveDuty(set: PrimeSet, get: () => Store) {
  const policy = get().policy;
  if (!policy.serve) return;
  const before = get().kernel;
  const turn = hear("act", before, policy);
  if (!estateMoved(before, turn.kernel)) return;
  set({
    kernel: turn.kernel,
    policy: { ...get().policy, next: turn.policy.next, lastOrder: policy.lastOrder, serve: true },
  });
  if (get().policy.night) return;
  writeLine(set, get, turn.reply, null);
  speak(turn.reply, get().voice);
}

export const usePrime = create<Store>()(
  persist(
    (set, get) => ({
      kernel: openingKernel(),
      policy: defaultPolicy(),
      lines: [greeting],
      seq: 1,
      hydrated: false,
      pending: false,
      voice: true,
      checks: 0,
      capNoted: false,
      watchIndex: 0,
      setVoice: (voice) => set({ voice }),
      absorb: (incoming, grantName) => {
        const result = absorbBatch(get().policy.notes, incoming, looksLikeSecret, Date.now());
        const grants =
          grantName && !looksLikeSecret(grantName) && !get().policy.grants.includes(grantName)
            ? [...get().policy.grants, grantName.slice(0, 80)].slice(-8)
            : get().policy.grants;
        const seq = get().seq;
        const line: Line = {
          id: `n${seq}`,
          role: "prime",
          text: result.summary,
          evidence: result.evidence,
          diff: null,
        };
        set({
          policy: { ...get().policy, notes: result.notes, grants },
          lines: [...get().lines, line].slice(-40),
          seq: seq + 1,
        });
        speak(result.summary, get().voice);
      },
      tickWatch: () => tick(set, get),
      send: async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const seq = get().seq;
        const turn = hear(trimmed, get().kernel, get().policy);
        const commander: Line = {
          id: `c${seq}`,
          role: "commander",
          text: trimmed,
          evidence: [],
          diff: null,
        };
        const prime: Line = {
          id: `p${seq}`,
          role: "prime",
          text: turn.reply,
          evidence: turn.evidence,
          diff: turn.diff,
        };
        set({
          kernel: turn.kernel,
          policy: turn.policy,
          lines: [...get().lines, commander, prime].slice(-40),
          seq: seq + 1,
          ...(turn.resetCap ? { checks: 0, capNoted: false } : {}),
        });
        speak(turn.reply, get().voice);
        if (turn.task && get().policy.online) await pull(set, get, turn.task, prime.id);
        if (turn.verbatim || get().policy.plain) return;
        const token = ++phraseToken;
        try {
          const voiced = await phraseBrief({ data: { brief: turn.reply } });
          if (token !== phraseToken) return;
          const last = get().lines[get().lines.length - 1];
          if (voiced.ok && voiced.text && last?.id === prime.id && acceptPhrase(turn.reply, voiced.text)) {
            set((s) => ({
              lines: s.lines.map((line) => (line.id === prime.id ? { ...line, text: voiced.text } : line)),
            }));
            speak(voiced.text, get().voice);
          }
        } catch {
          // The local brief already stands.
        }
      },
    }),
    {
      name: "prime-house-v2",
      skipHydration: true,
      storage: createJSONStorage(() => ({
        getItem: (key) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
        setItem: (key, value) => {
          if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
        },
        removeItem: (key) => {
          if (typeof localStorage !== "undefined") localStorage.removeItem(key);
        },
      })),
      partialize: (s) =>
        ({
          version: 2,
          kernel: s.kernel,
          policy: s.policy,
          lines: s.lines.slice(-40).map((line) => ({
            ...line,
            text: line.text.slice(0, 1200),
            evidence: line.evidence.slice(0, 12),
          })),
          seq: s.seq,
          voice: s.voice,
        }) satisfies HouseSave,
      merge: (persisted, current) => {
        const restored = restoreHouse(persisted);
        if (!restored) return current;
        return {
          ...current,
          kernel: restored.kernel,
          policy: restored.policy,
          lines: restored.lines.length > 0 ? restored.lines : current.lines,
          seq: restored.seq,
          voice: restored.voice,
        };
      },
    },
  ),
);
