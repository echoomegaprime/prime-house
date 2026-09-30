import { runCycle } from "../prometheus/cycle.ts";
import { listRefusals } from "../prometheus/gatekeeper.ts";
import { checkLiveAuth, checkSchemaGap, evaluate } from "../prometheus/guards.ts";
import { CANONICAL_CRYPTO, CANONICAL_VAULT_SQL, DEFECTS, JAIL_ROOT, MACHINES, rankOf } from "../prometheus/truth.ts";
import type { KernelState } from "../prometheus/types.ts";

export const LOCKED_ORDER =
  "Ask before a local packet edit. Two defects a cycle. Do not rewrite this order while the lock is on.";

export const MORE_BOOK = [
  "Worst — the first red guard",
  "Unprobed — guards with no fresh probe",
  "Passing — guards that pass",
  "Tighten — put the full brake back on",
  "Next — the one order I would give myself",
  "Act — do that order if it stays local",
  "Why — the last repair",
  "Jail — what FORGE may touch",
  "Tokens — stale auth and the fix",
  "Schema — the migration gap",
  "Refusals — the frozen list",
  "Rank — three highest open defects",
  "Machines — how far each host is",
  "Vault — local packet against the canonical line",
  "Pace slow — five minutes. Pace normal — one minute",
  "Night — keep learning, stay quiet",
  "Wake — speak on a new lesson again",
  "Pin lesson — pin the latest source",
  "Last lesson — the latest text I kept",
  "Plan — three steps. Run plan — do the first",
];

export interface House {
  lock: boolean;
  perCycle: 1 | 2 | 4;
  confirmLocal: boolean;
  order: string;
  generation: number;
  night: boolean;
  pace: 60 | 300;
  next: string;
  plan: string[];
  pins: string[];
}

export interface MoreHit {
  reply: string;
  evidence: string[];
  house: House;
  kernel: KernelState;
}

interface LessonRef {
  source: string;
  text: string;
}

function fails(kernel: KernelState) {
  return evaluate(kernel).filter((guard) => guard.status === "fail");
}

function recommend(kernel: KernelState, house: House): string {
  if (kernel.ledger.length === 0) return "dry run";
  const stale = kernel.knowledge.vaultLookup !== CANONICAL_VAULT_SQL || kernel.knowledge.vaultCrypto !== CANONICAL_CRYPTO;
  if (stale) return house.lock ? "dry run" : "cycle";
  if (fails(kernel).length > 0) return "worst";
  return "why";
}

function tight(house: House): boolean {
  return house.lock && house.perCycle === 2 && house.confirmLocal && house.order === LOCKED_ORDER;
}

function hit(kernel: KernelState, house: House, reply: string, evidence: string[]): MoreHit {
  return { reply, evidence, house, kernel };
}

function doDry(kernel: KernelState, house: House): MoreHit {
  const outcome = runCycle(structuredClone(kernel), undefined, { limit: house.perCycle, deferLocal: house.confirmLocal });
  const record = outcome.record;
  const reply =
    record.result === "held"
      ? "Dry run. Nothing new to admit. Nothing was merged."
      : `Dry run. Cycle would ${record.result}. Admitted lines ${record.closed.length}. Drafts ${record.proposed.length}. Nothing was merged.`;
  return hit(kernel, house, reply, [...record.closed.slice(0, 6), ...record.proposed.slice(0, 4)]);
}

function doCycle(kernel: KernelState, house: House): MoreHit {
  if (house.lock) {
    const dry = doDry(kernel, house);
    return hit(kernel, house, `Lock is on, so I did not merge. ${dry.reply}`, dry.evidence);
  }
  const outcome = runCycle(kernel, undefined, { limit: house.perCycle, deferLocal: false });
  return hit(
    outcome.state,
    house,
    `Act ran cycle ${outcome.record.cycle}. Result ${outcome.record.result}. Fleet files were not patched.`,
    [...outcome.record.closed.slice(0, 4), ...outcome.record.proposed.slice(0, 2)],
  );
}

function doTighten(kernel: KernelState, house: House): MoreHit {
  if (tight(house)) return hit(kernel, house, "Already tight. Lock on. Two defects a cycle. The standing order stays.", [LOCKED_ORDER]);
  const next: House = { ...house, lock: true, perCycle: 2, confirmLocal: true, order: LOCKED_ORDER, generation: Math.min(house.generation + 1, 9999) };
  return hit(kernel, next, `Tight. Generation ${next.generation}. The standing order cannot be rewritten until you release the lock.`, [LOCKED_ORDER]);
}

function doStep(step: string, kernel: KernelState, house: House, lessons: LessonRef[]): MoreHit | null {
  if (step === "dry run") return doDry(kernel, house);
  if (step === "cycle") return doCycle(kernel, house);
  if (step === "tighten") return doTighten(kernel, house);
  if (step === "worst" || step === "why" || step === "vault" || step === "jail" || step === "tokens") {
    return dispatch(step, kernel, house, lessons);
  }
  return null;
}

export function dispatch(t: string, kernel: KernelState, house: House, lessons: LessonRef[]): MoreHit | null {
  if (/^more$|^twenty more$|^more orders$/.test(t)) {
    return hit(kernel, house, "Twenty more. They act on this house. They do not take a machine.", MORE_BOOK);
  }
  if (/^worst$/.test(t)) {
    const guard = fails(kernel)[0];
    if (!guard) return hit(kernel, house, "No red guard.", []);
    return hit(kernel, house, `${guard.title}. ${guard.evidence}`, [`${guard.title}: ${guard.evidence}`]);
  }
  if (/^unprobed$/.test(t)) {
    const guards = evaluate(kernel).filter((guard) => guard.status === "unprobed");
    return hit(kernel, house, guards.length ? `${guards.length} unprobed.` : "Nothing unprobed.", guards.map((guard) => `${guard.title}: ${guard.evidence}`));
  }
  if (/^passing$/.test(t)) {
    const guards = evaluate(kernel).filter((guard) => guard.status === "pass");
    return hit(kernel, house, `${guards.length} passing.`, guards.map((guard) => guard.title));
  }
  if (/^tighten$/.test(t)) return doTighten(kernel, house);
  if (/^next$/.test(t)) {
    const step = recommend(kernel, house);
    return hit(kernel, { ...house, next: step }, `Next is ${step}. Say act and I will do it if it stays local.`, [step]);
  }
  if (/^act$/.test(t)) {
    const step = house.next || recommend(kernel, house);
    const done = doStep(step, kernel, { ...house, next: step }, lessons);
    if (!done) return hit(kernel, house, `Next is ${step}. Say it. I will not guess a second meaning.`, [step]);
    return { ...done, reply: step === "dry run" || step === "cycle" || step === "tighten" ? done.reply : `Act. ${done.reply}` };
  }
  if (/^why$/.test(t)) {
    const last = kernel.ledger[kernel.ledger.length - 1];
    if (!last) return hit(kernel, house, "No repair yet. The ledger is empty.", []);
    return hit(kernel, house, `Cycle ${last.cycle} ${last.result}. Closed ${last.closed.length}. Blocked ${last.blocked.length}.`, [
      ...last.closed.slice(0, 4),
      ...last.blocked.slice(0, 2),
    ]);
  }
  if (/^jail$/.test(t)) {
    return hit(kernel, house, `FORGE is jailed to ${JAIL_ROOT}. A path above that root is an escape. I can see the jail. I do not walk past it.`, [
      `${JAIL_ROOT} is the root.`,
      "ANVIL and CRUCIBLE are not reachable from here.",
    ]);
  }
  if (/^tokens$/.test(t)) {
    const guard = checkLiveAuth(4);
    return hit(kernel, house, `${guard.evidence} Fix is Disconnect, then Connect.`, [guard.evidence]);
  }
  if (/^schema$/.test(t)) {
    const guard = checkSchemaGap({ declared: 33, migrated: 20, namedUnmigrated: ["Property"] });
    return hit(kernel, house, guard.evidence, [`${guard.title}: ${guard.evidence}`]);
  }
  if (/^refusals$/.test(t)) {
    const lines = [...listRefusals()];
    return hit(kernel, house, `${lines.length} refusals. They are frozen. I cannot edit them.`, lines);
  }
  if (/^rank$/.test(t)) {
    const top = [...DEFECTS].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 3);
    const lines = top.map((defect) => `${defect.title} — rank ${Math.round(rankOf(defect))}`);
    return hit(kernel, house, `Top defect: ${top[0]?.title ?? "none"}.`, lines);
  }
  if (/^machines$/.test(t)) {
    const lines = MACHINES.map((machine) => `${machine.name} (${machine.os}): ${machine.reach}`);
    return hit(kernel, house, "Four machines. I do not have a shell on any of them.", lines);
  }
  if (/^vault$/.test(t)) {
    const lookupOk = kernel.knowledge.vaultLookup === CANONICAL_VAULT_SQL;
    const cryptoOk = kernel.knowledge.vaultCrypto === CANONICAL_CRYPTO;
    const reply =
      lookupOk && cryptoOk
        ? "Local packet matches the canonical line."
        : "Local packet is stale. A cycle can admit the local line. The fleet file stays a draft.";
    return hit(kernel, house, reply, [`Lookup ${kernel.knowledge.vaultLookup}`, `Crypto ${kernel.knowledge.vaultCrypto}`]);
  }
  if (/^pace (slow|normal|fast)$/.test(t)) {
    const slow = /slow$/.test(t);
    const pace: 60 | 300 = slow ? 300 : 60;
    const reply = slow ? "Pace slow. I re-read every five minutes." : "Pace normal. The floor is one minute. I will not go faster.";
    return hit(kernel, { ...house, pace }, reply, [`Pace ${pace} seconds.`]);
  }
  if (/^night$/.test(t)) {
    return hit(kernel, { ...house, night: true }, "Night. I keep reading. I file a lesson only when it changes, and I stay quiet.", []);
  }
  if (/^wake$/.test(t)) {
    return hit(kernel, { ...house, night: false }, "Awake. A changed lesson will be spoken.", []);
  }
  if (/^pin lesson$/.test(t)) {
    const lesson = lessons[lessons.length - 1];
    if (!lesson) return hit(kernel, house, "No lesson to pin.", []);
    if (house.pins.length >= 8) return hit(kernel, house, "Eight pins. Forget one first.", house.pins);
    if (house.pins.includes(lesson.source)) return hit(kernel, house, "That source is already pinned.", house.pins);
    const pins = [...house.pins, lesson.source.slice(0, 120)];
    return hit(kernel, { ...house, pins }, "Pinned the latest lesson.", pins);
  }
  if (/^last lesson$/.test(t)) {
    const lesson = lessons[lessons.length - 1];
    if (!lesson) return hit(kernel, house, "No lessons yet.", []);
    return hit(kernel, house, lesson.text, [lesson.source]);
  }
  if (/^plan$/.test(t)) {
    const first = recommend(kernel, house);
    const plan = [...new Set([first === "cycle" ? "dry run" : first, "worst", "vault", "why"])].slice(0, 3);
    return hit(kernel, { ...house, plan, next: plan[0] }, `Plan: ${plan.join(", ")}. Say run plan and I will do the first.`, plan);
  }
  if (/^run plan$/.test(t)) {
    const step = house.plan[0];
    if (!step) return hit(kernel, house, "No plan. Say plan.", []);
    const done = doStep(step, kernel, { ...house, next: step }, lessons);
    if (!done) return hit(kernel, { ...house, next: step }, `I will not run ${step}. It is not on the local list.`, house.plan);
    return {
      ...done,
      house: { ...done.house, plan: house.plan.slice(1), next: step },
      reply: `Ran ${step}. ${done.reply}`,
    };
  }
  if (/^dispatch$/.test(t)) {
    const steps = house.lock ? ["dry run", "worst", "vault"] : ["cycle", "worst", "vault"];
    let state = kernel;
    let nextHouse = house;
    const notes: string[] = [];
    for (const step of steps) {
      const done = doStep(step, state, nextHouse, lessons);
      if (!done) break;
      state = done.kernel;
      nextHouse = { ...done.house, plan: house.plan };
      notes.push(`${step}: ${done.reply}`);
    }
    const merged = house.lock ? "Nothing was merged." : "The lock was off, so one local cycle was allowed.";
    return hit(state, nextHouse, `Dispatch. ${notes.length} local steps. ${merged} I did not take a machine.`, notes);
  }
  return null;
}
