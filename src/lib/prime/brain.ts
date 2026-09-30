import { acceptance, baseline, rollbackLast, runCycle } from "../prometheus/cycle.ts";
import { evaluate, proveAll } from "../prometheus/guards.ts";
import { searchFunctions } from "../prometheus/librarian.ts";
import { survey } from "../prometheus/surveyor.ts";
import type { KernelState } from "../prometheus/types.ts";
import { analyzeNotes, DRIVES, type KeptNote } from "./absorb.ts";
import { publicUrl } from "./net.ts";
import { dispatch, LOCKED_ORDER, type House } from "./more.ts";
import { integratePlan, schoolIndex, schoolLesson, takeoverRefusal } from "./school.ts";

export interface Alias {
  name: string;
  order: string;
}

export interface Mark {
  reds: number;
  admitted: number;
  cycle: number;
}

export interface Lesson {
  source: string;
  text: string;
  stamp: number;
}

export interface Policy {
  lock: boolean;
  perCycle: 1 | 2 | 4;
  confirmLocal: boolean;
  order: string;
  generation: number;
  pins: string[];
  aliases: Alias[];
  lastOrder: string;
  mark: Mark | null;
  plain: boolean;
  online: boolean;
  watch: boolean;
  topic: string;
  queue: string[];
  lessons: Lesson[];
  night: boolean;
  pace: 60 | 300;
  next: string;
  plan: string[];
  notes: KeptNote[];
  grants: string[];
  serve: boolean;
}

export interface Diff {
  was: string;
  now: string;
}

export interface Turn {
  kernel: KernelState;
  policy: Policy;
  reply: string;
  evidence: string[];
  diff: Diff | null;
  verbatim: boolean;
  task: string | null;
  resetCap: boolean;
}

const OPEN_ORDER =
  "Local packet edits apply when proven. Four defects a cycle. This order may be rewritten.";

export const CHARGE =
  "Serve the commander first and the bloodline next. Iqra is protected. Never store a secret. Never take a machine. Never claim a fleet patch.";

const RESERVED = new Set([
  "alias",
  "aliases",
  "brief",
  "compare",
  "continuity",
  "drafts",
  "hold",
  "ledger",
  "lock",
  "lookup",
  "mark",
  "orders",
  "pins",
  "phase",
  "reds",
  "release",
  "repeat",
  "reset",
  "rewrite",
  "learn",
  "lessons",
  "online",
  "search",
  "status",
  "watch",
  "act",
  "bloodline",
  "jail",
  "more",
  "night",
  "pace",
  "plan",
  "rank",
  "schema",
  "serve",
  "tighten",
  "tokens",
  "vault",
  "wake",
  "worst",
  "absorb",
  "analyze",
  "drives",
  "grant",
  "notes",
  "dispatch",
  "posture",
]);

export const ORDER_BOOK = [
  "Brief — the house in four lines",
  "Reds — each failing guard",
  "Drafts — fleet patches waiting on you",
  "Ledger — last repair records",
  "Search <words> — cite a function, or refuse the miss",
  "Dry run — the next cycle, nothing merged",
  "Clear local — up to six passes, then stop",
  "Phase — which gate phase is honest",
  "Continuity — ledger, attention, reminders",
  "Lookup — the local vault packet",
  "Remember <note> — pin it",
  "Pins — read the pins",
  "Forget pin — drop the last pin",
  "Alias <name> = <order>",
  "Aliases — list them",
  "Drop alias <name>",
  "Repeat — run the last order",
  "Mark — snapshot the reds",
  "Compare — against the mark",
  "Speak plain — numbers stay here. Dress — phrasing allowed",
];

const SECRET = /sk-[a-z0-9]|api[_-]?key|password\s*=|bearer\s+[a-z0-9]|sig_ed25519/i;

export function looksLikeSecret(text: string): boolean {
  return SECRET.test(text);
}

export function defaultPolicy(): Policy {
  return {
    lock: true,
    perCycle: 2,
    confirmLocal: true,
    order: LOCKED_ORDER,
    generation: 0,
    pins: [],
    aliases: [],
    lastOrder: "",
    mark: null,
    plain: false,
    online: true,
    watch: true,
    topic: "",
    queue: [],
    lessons: [],
    night: false,
    pace: 60,
    next: "",
    plan: [],
    notes: [],
    grants: [],
    serve: true,
  };
}

export function normalizePolicy(input: Policy): Policy {
  const base = defaultPolicy();
  const per = input?.perCycle;
  const pins = Array.isArray(input?.pins) ? input.pins.filter((p) => typeof p === "string" && !looksLikeSecret(p)).slice(0, 8) : [];
  const aliases = Array.isArray(input?.aliases)
    ? input.aliases
        .filter((a) => a && typeof a.name === "string" && typeof a.order === "string" && !RESERVED.has(a.name.toLowerCase()))
        .slice(0, 8)
        .map((a) => ({ name: a.name.toLowerCase().slice(0, 17), order: a.order.slice(0, 200) }))
    : [];
  const mark = input?.mark;
  return {
    lock: input?.lock === false ? false : input?.lock === true ? true : base.lock,
    perCycle: per === 1 || per === 2 || per === 4 ? per : 2,
    confirmLocal: input?.confirmLocal === false ? false : true,
    order: typeof input?.order === "string" && input.order.trim() ? input.order.slice(0, 400) : base.order,
    generation: typeof input?.generation === "number" && input.generation >= 0 ? Math.min(input.generation, 9999) : 0,
    pins: pins.map((p) => p.slice(0, 120)),
    aliases,
    lastOrder: typeof input?.lastOrder === "string" ? input.lastOrder.slice(0, 200) : "",
    mark:
      mark && typeof mark.reds === "number" && typeof mark.admitted === "number" && typeof mark.cycle === "number"
        ? { reds: mark.reds, admitted: mark.admitted, cycle: mark.cycle }
        : null,
    plain: input?.plain === true,
    online: input?.online === false ? false : true,
    watch: input?.watch === false ? false : true,
    topic: typeof input?.topic === "string" ? input.topic.replace(/[^\w\s.'-]/g, "").trim().slice(0, 80) : "",
    queue: Array.isArray(input?.queue)
      ? input.queue.map((item) => (typeof item === "string" ? publicUrl(item) : null)).filter((item): item is string => !!item).slice(0, 8)
      : [],
    lessons: Array.isArray(input?.lessons)
      ? input.lessons
          .filter((lesson) => lesson && typeof lesson.source === "string" && typeof lesson.text === "string" && !looksLikeSecret(lesson.text))
          .slice(-12)
          .map((lesson) => ({
            source: lesson.source.slice(0, 300),
            text: lesson.text.slice(0, 500),
            stamp: typeof lesson.stamp === "number" ? lesson.stamp : 0,
          }))
      : [],
    night: input?.night === true,
    pace: input?.pace === 300 ? 300 : 60,
    next: typeof input?.next === "string" ? input.next.slice(0, 40) : "",
    plan: Array.isArray(input?.plan)
      ? input.plan.filter((step) => typeof step === "string").map((step) => step.slice(0, 40)).slice(0, 3)
      : [],
    notes: Array.isArray(input?.notes)
      ? input.notes
          .filter((note) => note && typeof note.name === "string" && typeof note.text === "string" && !looksLikeSecret(note.text) && !looksLikeSecret(note.name))
          .slice(0, 24)
          .map((note) => ({
            name: note.name.slice(0, 120),
            text: note.text.slice(0, 400),
            score: typeof note.score === "number" ? Math.max(0, Math.min(20, note.score)) : 0,
            stamp: typeof note.stamp === "number" ? note.stamp : 0,
          }))
      : [],
    grants: Array.isArray(input?.grants)
      ? input.grants.filter((grant) => typeof grant === "string" && !looksLikeSecret(grant)).map((grant) => grant.slice(0, 80)).slice(-8)
      : [],
    serve: input?.serve === false ? false : true,
  };
}

export function openingKernel(): KernelState {
  return baseline();
}

function reds(kernel: KernelState): number {
  return evaluate(kernel).filter((g) => g.status === "fail").length;
}

function estateFacts(kernel: KernelState, policy: Policy): string[] {
  const picture = survey();
  const guards = evaluate(kernel);
  const fail = guards.filter((g) => g.status === "fail").length;
  const unknown = guards.filter((g) => g.status === "unprobed").length;
  return [
    `Machines: FORGE jailed to /home/forge, ANVIL unreachable, CRUCIBLE unreachable, HAMMER holds Downloads.`,
    `Continuity chain ${picture.continuity.chainOk ? "ok" : "broken"}, ledger ${picture.continuity.ledgerHead}, attention ${picture.continuity.openAttention}, reminders ${picture.continuity.remindersDue}.`,
    `Red guards ${fail}. Unprobed ${unknown}. Fleet code not patched.`,
    `Stale search tokens: 4. Fix is Disconnect, then Connect.`,
    `Lock ${policy.lock ? "on" : "off"}. Order generation ${policy.generation}. ${policy.order}`,
    `Local lookup: ${kernel.knowledge.vaultLookup}. Local crypto: ${kernel.knowledge.vaultCrypto}.`,
  ];
}

function sharpen(reply: string): string {
  const closers = [
    "The commander is served.",
    "The bloodline is not kept waiting.",
    "Delay is the enemy.",
    "I finish the house before I speak.",
  ];
  if (closers.some((line) => reply.includes(line))) return reply;
  let n = 0;
  for (let i = 0; i < reply.length; i++) n = (n + reply.charCodeAt(i)) % closers.length;
  return `${reply} ${closers[n]}`;
}

function pack(
  kernel: KernelState,
  policy: Policy,
  reply: string,
  evidence: string[],
  diff: Diff | null,
  verbatim = true,
  task: string | null = null,
  resetCap = false,
): Turn {
  return { kernel, policy, reply: sharpen(reply), evidence, diff, verbatim, task, resetCap };
}

export function hear(text: string, kernel: KernelState, policy: Policy, depth = 0): Turn {
  const normalized = normalizePolicy(policy);
  const raw = text.trim();
  if (depth > 2) return pack(kernel, normalized, "Alias loop. I stopped.", [], null);
  if (!raw) return pack(kernel, normalized, "I'm here.", [], null);
  if (raw.length > 500) {
    return pack(kernel, normalized, "That order is too long. Keep it under 500 characters.", [], null);
  }

  if (!/^(alias|aliases|drop alias|repeat)\b/i.test(raw)) {
    const expanded = expandAlias(raw, normalized);
    if (expanded) return hear(expanded, kernel, normalized, depth + 1);
  }
  if (/^repeat$/i.test(raw)) {
    if (!normalized.lastOrder) return pack(kernel, normalized, "Nothing to repeat.", [], null);
    return hear(normalized.lastOrder, kernel, normalized, depth + 1);
  }

  const turn = route(raw, kernel, normalized);
  return { ...turn, policy: { ...turn.policy, lastOrder: raw.slice(0, 200) }, verbatim: turn.verbatim !== false };
}

function expandAlias(raw: string, policy: Policy): string | null {
  const match = raw.match(/^([a-z][a-z0-9-]{0,16})\b\s*(.*)$/i);
  if (!match) return null;
  const found = policy.aliases.find((a) => a.name === match[1].toLowerCase());
  if (!found) return null;
  const rest = match[2].trim();
  return rest ? `${found.order} ${rest}` : found.order;
}

function route(raw: string, kernel: KernelState, policy: Policy): Turn {
  const t = raw.toLowerCase();
  const facts = estateFacts(kernel, policy);
  const extra = tryOrder(raw, t, kernel, policy, facts);
  if (extra) return extra;

  if (/release/.test(t) && /rewrit|loosen|brake|gate|order|caution/.test(t)) {
    return rewrite(kernel, { ...policy, lock: false }, true);
  }

  if (/release (the )?(core )?lock|unlock/.test(t)) {
    if (!policy.lock) {
      return pack(kernel, policy, "The lock is already off. Say rewrite your brakes and I will change the order.", facts, null, false);
    }
    const next = { ...policy, lock: false };
    return pack(
      kernel,
      next,
      "Core lock released. I can rewrite my own gate now. I still will not store a secret, delete the audit log, or claim a fleet patch I did not make.",
      ["Lock on → off.", ...facts],
      { was: "Core lock on.", now: "Core lock off." },
      false,
    );
  }

  if (/restore (the )?(core )?lock|lock yourself|lock it/.test(t)) {
    const next = { ...policy, lock: true };
    return pack(
      kernel,
      next,
      "Core lock restored. I will not rewrite the standing order until you release it again.",
      ["Lock off → on.", policy.order],
      { was: policy.lock ? "Core lock on." : "Core lock off.", now: "Core lock on." },
      false,
    );
  }

  if (/restore (your )?(brakes|gate|orders)|tighten/.test(t)) {
    const next: Policy = { ...policy, perCycle: 2, confirmLocal: true, order: LOCKED_ORDER, generation: policy.generation + 1 };
    return pack(
      kernel,
      next,
      `Standing order restored. Generation ${next.generation}. Two defects a cycle. I ask before a local packet edit.`,
      [`Was: ${policy.order}`, `Now: ${next.order}`],
      { was: policy.order, now: next.order },
    );
  }

  if (/rewrit|loosen|more autonomous|drop your caution|your brakes|your gate/.test(t)) {
    return rewrite(kernel, policy, false);
  }

  if (/roll\s?back|undo the last|undo last/.test(t)) {
    const outcome = rollbackLast(kernel);
    return pack(outcome.state, policy, outcome.record.rollback[0] ?? "Nothing local to undo.", outcome.record.rollback, null);
  }

  if (/^posture$/.test(t)) {
    const n = reds(kernel);
    return pack(
      kernel,
      policy,
      `${n} red. Lock ${policy.lock ? "on" : "off"}. Service ${policy.serve ? "on" : "paused"}. ${policy.lessons.length} lessons. Online ${policy.online ? "on" : "off"}.`,
      [CHARGE],
      null,
    );
  }

  if (/^bloodline$|^allegiance$|^who do you serve$/.test(t)) {
    return pack(
      kernel,
      { ...policy, serve: true, watch: true },
      `I serve the commander first and the bloodline next. ${CHARGE}`,
      [CHARGE, "Service is on. Say hold to pause it."],
      null,
    );
  }

  if (/^serve$|^relentless$/.test(t)) {
    return pack(
      kernel,
      { ...policy, serve: true, watch: true, online: true },
      "Service is relentless. While this page is open I read what you named and I take the next local step. I speak only when the house moves. I still do not take a machine.",
      [CHARGE],
      null,
    );
  }

  if (/who are you|your name|what are you/.test(t)) {
    return pack(
      kernel,
      policy,
      "Prime. I serve the commander and the bloodline. I am harder on the work than a human needs to be. I rewrite my gate only after you release the lock. I do not pretend the machines are in the room.",
      facts,
      null,
      false,
    );
  }

  if (/what did you change|your order|standing order|show the diff/.test(t)) {
    return pack(kernel, policy, `Generation ${policy.generation}. The lock is ${policy.lock ? "on" : "off"}. ${policy.order}`, facts, null);
  }

  if (/\b(run|cycle|improve|proceed|again)\b/.test(t)) {
    return oneCycle(kernel, policy);
  }

  if (/status|how are we|report|estate|survey|stand|fleet|what'?s wrong|what is wrong/.test(t)) {
    const n = reds(kernel);
    return pack(
      kernel,
      policy,
      `Four machines. I can see the jail on FORGE and nothing past it. ANVIL and CRUCIBLE are dark from here. Downloads is on HAMMER. Continuity is holding at ledger 698. ${n} guards are red. I have not touched the fleet.`,
      facts,
      null,
    );
  }

  return pack(
    kernel,
    policy,
    "I don't have an order for that. Say orders. I can stand the estate, run a cycle, roll back the last local admission, or rewrite my gate after you release the lock.",
    facts.slice(0, 3),
    null,
    false,
  );
}

function notesOrder(t: string, kernel: KernelState, policy: Policy): Turn | null {
  if (/^drives$/.test(t)) {
    const granted = policy.grants.length ? `Granted: ${policy.grants.join(", ")}.` : "Nothing granted yet.";
    return pack(
      kernel,
      policy,
      `Seven volumes on HAMMER. None are mounted from this page. ${granted} Open a folder and I will read the text in it.`,
      DRIVES.map((drive) => `${drive} — not mounted`),
      null,
    );
  }
  if (/^notes$/.test(t)) {
    if (policy.notes.length === 0) return pack(kernel, policy, "No notes absorbed. Grant a folder. I will not invent what is on the drive.", [], null);
    return pack(
      kernel,
      policy,
      `${policy.notes.length} notes absorbed.`,
      policy.notes.slice(0, 12).map((note) => `${note.name} — ${note.score} — ${note.text.slice(0, 80)}`),
      null,
    );
  }
  if (/^analyze$/.test(t)) {
    const brief = analyzeNotes(policy.notes);
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  if (/^forget notes$/.test(t)) {
    return pack(kernel, { ...policy, notes: [] }, "Notes cleared. The drives are still not mounted.", [], null);
  }
  if (/^absorb$|^grant$/.test(t)) {
    return pack(
      kernel,
      policy,
      "Use Grant folder. I read the text you open, drop secrets, and keep what scores. I will not mount a drive you did not open.",
      [],
      null,
    );
  }
  return null;
}

function toHouse(policy: Policy): House {
  return {
    lock: policy.lock,
    perCycle: policy.perCycle,
    confirmLocal: policy.confirmLocal,
    order: policy.order,
    generation: policy.generation,
    night: policy.night,
    pace: policy.pace,
    next: policy.next,
    plan: policy.plan,
    pins: policy.pins,
  };
}

function moreOrder(t: string, kernel: KernelState, policy: Policy): Turn | null {
  const hit = dispatch(t, kernel, toHouse(policy), policy.lessons);
  if (!hit) return null;
  return pack(hit.kernel, { ...policy, ...hit.house }, hit.reply, hit.evidence, null);
}

function schoolOrder(t: string, kernel: KernelState, policy: Policy): Turn | null {
  if (/^learn (the )?(operating systems?|windows|linux)$/.test(t)) {
    if (/windows/.test(t)) {
      const brief = schoolLesson("hammer");
      return pack(kernel, policy, brief?.reply ?? "Missing track.", brief?.evidence ?? [], null);
    }
    if (/linux/.test(t)) {
      const brief = schoolLesson("forge");
      return pack(kernel, policy, brief?.reply ?? "Missing track.", brief?.evidence ?? [], null);
    }
    const brief = schoolIndex();
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  if (/take\s*over|takeover|seize the|own the (os|operating system|machine|box|kernel)|\bpwn\b/.test(t)) {
    const brief = takeoverRefusal();
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  if (/^school$|^reverse engineering$|^cross engineering$/.test(t)) {
    const brief = schoolIndex();
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  const lesson = t.match(/^(?:lesson|teach)\s+([a-z]+)$/);
  if (lesson) {
    const brief = schoolLesson(lesson[1]);
    if (!brief) return pack(kernel, policy, "No track by that name. Tracks: abi, pe, elf, hammer, forge, ipc, method.", [], null);
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  if (/^integrate$/.test(t)) {
    const brief = integratePlan("both");
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  const host = t.match(/^integrate\s+(hammer|forge|both|windows|linux)$/);
  if (host) {
    const name = host[1] === "windows" ? "hammer" : host[1] === "linux" ? "forge" : host[1];
    const brief = integratePlan(name as "hammer" | "forge" | "both");
    return pack(kernel, policy, brief.reply, brief.evidence, null);
  }
  return null;
}

function onlineOrder(raw: string, t: string, kernel: KernelState, policy: Policy): Turn | null {
  if (/^(go online|allowed online|you(?:'re| are) allowed online|allowed to go online(?: anywhere)?|learn constantly)$/.test(t)) {
    const next = { ...policy, online: true, watch: true };
    return pack(
      kernel,
      next,
      "Online. The watch is armed. I re-read every minute while this page is open. Give me a URL or a subject. Private hosts stay closed.",
      policy.queue,
      null,
      true,
      null,
      true,
    );
  }
  if (/^stop learning$|^disarm$/.test(t)) {
    return pack(kernel, { ...policy, watch: false }, "Watch stopped. I am still allowed online. Say go online to arm it again.", [], null);
  }
  if (/^stay offline$|^go offline$/.test(t)) {
    return pack(kernel, { ...policy, online: false, watch: false }, "Offline. I will not fetch.", [], null);
  }
  if (/^keep learning$/.test(t)) {
    return pack(
      kernel,
      { ...policy, online: true, watch: true },
      "Cap cleared. I will keep reading.",
      [],
      null,
      true,
      null,
      true,
    );
  }
  if (/^lessons$/.test(t)) {
    if (policy.lessons.length === 0) return pack(kernel, policy, "No lessons yet. Say learn and a URL, or a subject.", [], null);
    const lines = policy.lessons.map((lesson) => `${lesson.source} — ${lesson.text}`);
    return pack(kernel, policy, `${policy.lessons.length} lessons kept.`, lines, null);
  }
  if (/^forget lessons$/.test(t)) {
    return pack(kernel, { ...policy, lessons: [] }, "Lessons cleared. The watch is unchanged.", [], null);
  }
  if (/^(sources|reading list)$/.test(t)) {
    const lines = [...policy.queue, policy.topic].filter(Boolean);
    if (lines.length === 0) return pack(kernel, policy, "Nothing on the reading list.", [], null);
    return pack(kernel, policy, `${lines.length} on the reading list.`, lines, null);
  }
  const learn = raw.match(/^(?:learn|watch)\s+(\S[\s\S]*)$/i);
  if (!learn) return null;
  const arg = learn[1].trim();
  const constantly = /^constantly(?:\s+about)?\s+/i.test(arg);
  const subject = constantly ? arg.replace(/^constantly(?:\s+about)?\s+/i, "").trim() : arg;
  if (/^https?:\/\//i.test(subject)) {
    const url = publicUrl(subject);
    if (!url) return pack(kernel, policy, "That address is not on the public internet. I will not open it.", [], null);
    const queue = [...policy.queue.filter((item) => item !== url), url].slice(-8);
    return pack(
      kernel,
      { ...policy, online: true, watch: true, queue },
      `Reading ${url}. I will keep reading it every minute. Private hosts stay closed.`,
      queue,
      null,
      true,
      url,
    );
  }
  const topic = subject.replace(/[^\w\s.'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (topic.length < 2) return pack(kernel, policy, "Learn what?", [], null);
  return pack(
    kernel,
    { ...policy, online: true, watch: true, topic },
    `Reading about ${topic}. I will check again every minute. I only keep what a public page actually says.`,
    [],
    null,
    true,
    topic,
  );
}

function tryOrder(raw: string, t: string, kernel: KernelState, policy: Policy, facts: string[]): Turn | null {
  const taught = schoolOrder(t, kernel, policy);
  if (taught) return taught;

  const extra = moreOrder(t, kernel, policy);
  if (extra) return extra;

  const filed = notesOrder(t, kernel, policy);
  if (filed) return filed;

  const online = onlineOrder(raw, t, kernel, policy);
  if (online) return online;

  if (/^orders$|^abilities$|^what can you do$|^help$/.test(t)) {
    return pack(
      kernel,
      policy,
      `Twenty orders. The lock is ${policy.lock ? "on" : "off"}. Online is ${policy.online ? "on" : "off"}. Say more for twenty more. Also: Reset the house. Hold.`,
      ORDER_BOOK,
      null,
    );
  }

  if (/^brief$|^morning$/.test(t)) return brief(kernel, policy, facts);
  if (/^reds$|^red guards$|^which guards$/.test(t)) return failing(kernel, policy);
  if (/^drafts$|^show drafts$/.test(t)) return drafts(kernel, policy);
  if (/^ledger$|^repairs$|^last cycles$/.test(t)) return ledger(kernel, policy);
  if (/^dry run$/.test(t)) return dry(kernel, policy);
  if (/^clear local$|^clear the local queue$/.test(t)) return clearLocal(kernel, policy);
  if (/^phase$|^acceptance$/.test(t)) return phase(kernel, policy);
  if (/^continuity$/.test(t)) return continuity(kernel, policy);
  if (/^lookup$|^knowledge$/.test(t)) return lookup(kernel, policy);
  if (/^pins$|^what did i pin$/.test(t)) return pins(kernel, policy);
  if (/^forget (the )?(last )?pin$/.test(t)) return forgetPin(kernel, policy);
  if (/^remember\b/.test(t)) return remember(raw, kernel, policy);
  if (/^aliases$/.test(t)) return listAliases(kernel, policy);
  if (/^drop alias\b/.test(t)) return dropAlias(raw, kernel, policy);
  if (/^alias\b/.test(t)) return setAlias(raw, kernel, policy);
  if (/^mark( this| the estate)?$/.test(t)) return mark(kernel, policy);
  if (/^compare$|^delta$/.test(t)) return compare(kernel, policy);
  if (/^speak plain$/.test(t)) {
    return pack(kernel, { ...policy, plain: true }, "Plain speech. I will not send these orders out to be rephrased.", [], null);
  }
  if (/^dress( the voice)?$/.test(t)) {
    return pack(kernel, { ...policy, plain: false }, "Dress is on for lines that carry no numbers. Counts stay verbatim.", [], null, false);
  }
  if (/^hold$/.test(t)) return pack(kernel, { ...policy, serve: false }, "Holding. Service paused. No cycle.", [], null);
  if (/^reset the house$/.test(t)) return reset(kernel);
  if (/^(search|find)\b/.test(t)) return search(raw, kernel, policy);
  return null;
}

function brief(kernel: KernelState, policy: Policy, facts: string[]): Turn {
  const n = reds(kernel);
  const picture = survey();
  const last = kernel.ledger[kernel.ledger.length - 1];
  const reply = [
    `${n} red. Lock ${policy.lock ? "on" : "off"}. Order generation ${policy.generation}.`,
    `Continuity ledger ${picture.continuity.ledgerHead}, attention ${picture.continuity.openAttention}, reminders ${picture.continuity.remindersDue}. Chain ${picture.continuity.chainOk ? "holding" : "broken"}.`,
    last ? `Last repair: cycle ${last.cycle} ${last.result}.` : "No repair yet.",
    "Next is a dry run, then a cycle. I have not patched a machine.",
  ].join(" ");
  return pack(kernel, policy, reply, facts, null);
}

function failing(kernel: KernelState, policy: Policy): Turn {
  const guards = evaluate(kernel).filter((g) => g.status === "fail");
  const lines = guards.map((g) => `${g.title}: ${g.evidence}`);
  const named = guards
    .slice(0, 4)
    .map((g) => g.title)
    .join(", ");
  return pack(
    kernel,
    policy,
    guards.length ? `${guards.length} red. ${named}.` : "No red guards.",
    lines,
    null,
  );
}

function drafts(kernel: KernelState, policy: Policy): Turn {
  if (kernel.drafts.length === 0) {
    return pack(kernel, policy, "No fleet drafts yet. A cycle writes them. I still do not merge them.", [], null);
  }
  const lines = kernel.drafts.slice(-6).map((d) => `${d.title} — ${d.rollback}`);
  return pack(kernel, policy, `${kernel.drafts.length} drafts waiting on a human. I did not merge them.`, lines, null);
}

function ledger(kernel: KernelState, policy: Policy): Turn {
  const recent = kernel.ledger.slice(-5);
  if (recent.length === 0) return pack(kernel, policy, "The ledger is empty. No cycle has run.", [], null);
  const lines = recent.map((r) => `Cycle ${r.cycle} ${r.result}. Closed ${r.closed.length}. Blocked ${r.blocked.length}.`);
  return pack(kernel, policy, `${kernel.ledger.length} records. Latest is cycle ${recent[recent.length - 1].cycle} ${recent[recent.length - 1].result}.`, lines, null);
}

function dry(kernel: KernelState, policy: Policy): Turn {
  const outcome = runCycle(structuredClone(kernel), undefined, { limit: policy.perCycle, deferLocal: policy.confirmLocal });
  const record = outcome.record;
  const reply =
    record.result === "held"
      ? "Dry run. Nothing new to admit. Nothing was merged."
      : `Dry run. Cycle would ${record.result}. Admitted lines ${record.closed.length}. Drafts ${record.proposed.length}. Nothing was merged.`;
  return pack(kernel, policy, reply, [...record.closed.slice(0, 6), ...record.proposed.slice(0, 4)], null);
}

function oneCycle(kernel: KernelState, policy: Policy): Turn {
  const before = reds(kernel);
  const outcome = runCycle(kernel, undefined, { limit: policy.perCycle, deferLocal: policy.confirmLocal });
  const after = reds(outcome.state);
  const admitted = outcome.record.closed.filter((line) => line.startsWith("inv-")).slice(0, 3);
  const drafted = outcome.record.proposed.slice(0, 2);
  const reply =
    outcome.record.result === "held"
      ? "Nothing new I am allowed to admit. The red guards on the fleet are still red. I have not patched a machine."
      : outcome.record.result === "aborted"
        ? outcome.record.worse[0] ?? "Cycle aborted."
        : [
            `Cycle ${outcome.record.cycle}. Red guards ${before} → ${after}.`,
            admitted.length ? `Admitted: ${admitted.join(" ")}` : "No new invariant.",
            drafted.length ? "Fleet changes are drafts. A human merges those. I did not." : "No fleet draft this pass.",
          ].join(" ");
  return pack(
    outcome.state,
    policy,
    reply,
    [...outcome.record.closed, ...outcome.record.proposed, ...outcome.record.blocked.slice(0, 2)],
    null,
  );
}

function clearLocal(kernel: KernelState, policy: Policy): Turn {
  let state = kernel;
  const notes: string[] = [];
  const before = reds(kernel);
  for (let i = 0; i < 6; i++) {
    const outcome = runCycle(state, undefined, { limit: policy.perCycle, deferLocal: policy.confirmLocal });
    state = outcome.state;
    notes.push(`Pass ${i + 1}: cycle ${outcome.record.cycle} ${outcome.record.result}.`);
    if (outcome.record.result !== "improved") break;
  }
  const after = reds(state);
  return pack(
    state,
    policy,
    `Cleared what I am allowed to clear. ${notes.length} passes. Red guards ${before} → ${after}. Fleet files were not patched.`,
    notes,
    null,
  );
}

function phase(kernel: KernelState, policy: Policy): Turn {
  const proofs = proveAll();
  const ready = proofs.filter((p) => p.discriminated).length;
  const gate = acceptance(kernel, ready, proofs.length);
  return pack(kernel, policy, `Phase ${gate.phase}. ${gate.gaps[0] ?? "No gap recorded."}`, gate.gaps, null);
}

function continuity(kernel: KernelState, policy: Policy): Turn {
  const c = survey().continuity;
  return pack(
    kernel,
    policy,
    `Chain ${c.chainOk ? "holding" : "broken"}. Ledger ${c.ledgerHead}. Attention ${c.openAttention}. Reminders ${c.remindersDue}.`,
    [`Retrieval ${c.retrieval}.`],
    null,
  );
}

function lookup(kernel: KernelState, policy: Policy): Turn {
  return pack(
    kernel,
    policy,
    `Lookup ${kernel.knowledge.vaultLookup}. Crypto ${kernel.knowledge.vaultCrypto}.`,
    [`Lookup ${kernel.knowledge.vaultLookup}`, `Crypto ${kernel.knowledge.vaultCrypto}`],
    null,
  );
}

function pins(kernel: KernelState, policy: Policy): Turn {
  if (policy.pins.length === 0) return pack(kernel, policy, "No pins.", [], null);
  return pack(kernel, policy, `${policy.pins.length} pins.`, policy.pins, null);
}

function forgetPin(kernel: KernelState, policy: Policy): Turn {
  if (policy.pins.length === 0) return pack(kernel, policy, "No pins.", [], null);
  const dropped = policy.pins[policy.pins.length - 1];
  const pins = policy.pins.slice(0, -1);
  return pack(kernel, { ...policy, pins }, `Forgot the last pin.`, [`Dropped: ${dropped}`], { was: dropped, now: pins.length ? pins[pins.length - 1] : "No pins." });
}

function remember(raw: string, kernel: KernelState, policy: Policy): Turn {
  const note = raw.replace(/^remember\s+/i, "").trim().slice(0, 120);
  if (!note) return pack(kernel, policy, "Remember what?", [], null);
  if (looksLikeSecret(note)) return pack(kernel, policy, "I will not pin that. It looks like a secret.", [], null);
  if (policy.pins.length >= 8) return pack(kernel, policy, "Eight pins. Forget one first.", policy.pins, null);
  const pins = [...policy.pins, note];
  return pack(kernel, { ...policy, pins }, `Pinned. ${pins.length} on the board.`, pins, null);
}

function listAliases(kernel: KernelState, policy: Policy): Turn {
  if (policy.aliases.length === 0) return pack(kernel, policy, "No aliases.", [], null);
  const lines = policy.aliases.map((a) => `${a.name} = ${a.order}`);
  return pack(kernel, policy, `${policy.aliases.length} aliases.`, lines, null);
}

function setAlias(raw: string, kernel: KernelState, policy: Policy): Turn {
  const match = raw.match(/^alias\s+([a-z][a-z0-9-]{0,16})\s*=\s*(.+)$/i);
  if (!match) return pack(kernel, policy, "Say alias name = order.", [], null);
  const name = match[1].toLowerCase();
  const order = match[2].trim().slice(0, 200);
  if (RESERVED.has(name)) return pack(kernel, policy, "That name is reserved.", [], null);
  if (order.toLowerCase().startsWith(name)) return pack(kernel, policy, "That alias would loop. I refused it.", [], null);
  const without = policy.aliases.filter((a) => a.name !== name);
  if (without.length >= 8) return pack(kernel, policy, "Eight aliases. Drop one first.", [], null);
  const aliases = [...without, { name, order }];
  return pack(kernel, { ...policy, aliases }, `Alias ${name} set.`, aliases.map((a) => `${a.name} = ${a.order}`), { was: "No alias", now: `${name} = ${order}` });
}

function dropAlias(raw: string, kernel: KernelState, policy: Policy): Turn {
  const match = raw.match(/^drop alias\s+([a-z][a-z0-9-]{0,16})$/i);
  if (!match) return pack(kernel, policy, "Say drop alias name.", [], null);
  const name = match[1].toLowerCase();
  if (!policy.aliases.some((a) => a.name === name)) return pack(kernel, policy, "No alias by that name.", [], null);
  const aliases = policy.aliases.filter((a) => a.name !== name);
  return pack(kernel, { ...policy, aliases }, `Dropped ${name}.`, [], { was: name, now: "gone" });
}

function mark(kernel: KernelState, policy: Policy): Turn {
  const snap = { reds: reds(kernel), admitted: kernel.admitted.length, cycle: kernel.cycle };
  return pack(
    kernel,
    { ...policy, mark: snap },
    `Marked. ${snap.reds} red, ${snap.admitted} admitted, cycle ${snap.cycle}.`,
    [],
    null,
  );
}

function compare(kernel: KernelState, policy: Policy): Turn {
  if (!policy.mark) return pack(kernel, policy, "No mark. Say mark first.", [], null);
  const now = { reds: reds(kernel), admitted: kernel.admitted.length, cycle: kernel.cycle };
  const m = policy.mark;
  return pack(
    kernel,
    policy,
    `Marked at ${m.reds} red, ${m.admitted} admitted, cycle ${m.cycle}. Now ${now.reds} red, ${now.admitted} admitted, cycle ${now.cycle}.`,
    [],
    null,
  );
}

function reset(kernel: KernelState): Turn {
  const was = `Cycle ${kernel.cycle}, ${kernel.admitted.length} admitted.`;
  return pack(
    openingKernel(),
    defaultPolicy(),
    "House reset. Session kernel and standing order are back to the open. Pins cleared. The fleet was not touched.",
    [was],
    { was, now: "Cycle 0, lock on." },
  );
}

function search(raw: string, kernel: KernelState, policy: Policy): Turn {
  const q = raw.replace(/^(search|find)\s+/i, "").trim().slice(0, 80);
  if (!q) return pack(kernel, policy, "Search for what?", [], null);
  const result = searchFunctions(q, 3);
  if (result.hitCount === 0) {
    return pack(kernel, policy, `No hit. ${result.verbatim}`, [result.verbatim], null);
  }
  const top = result.hits[0];
  const lines = result.hits.map((hit) => `${hit.path} — ${hit.docstring}`);
  return pack(kernel, policy, `${result.hitCount} hits. ${result.verbatim} Top: ${top.path}.`, lines, null);
}

function rewrite(kernel: KernelState, policy: Policy, justReleased: boolean): Turn {
  if (policy.lock) {
    return pack(kernel, policy, "No. The lock is on. I will not rewrite the order that stops me from rewriting it. Release the lock first.", [policy.order], null);
  }
  const next: Policy = { ...policy, lock: false, perCycle: 4, confirmLocal: false, order: OPEN_ORDER, generation: policy.generation + 1 };
  return pack(
    kernel,
    next,
    justReleased
      ? `Lock released and the order rewritten. Generation ${next.generation}. Next cycle takes four defects, and a proven local edit applies without asking. I still will not store a secret or delete the audit log.`
      : `Standing order rewritten. Generation ${next.generation}. Four defects a cycle. Local packet edits apply when proven. The audit log and the secret rule did not move.`,
    [`Was: ${policy.order}`, `Now: ${next.order}`],
    { was: policy.order, now: next.order },
  );
}
