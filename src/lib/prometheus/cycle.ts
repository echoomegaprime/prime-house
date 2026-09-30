import { prove } from "./forge.ts";
import { fleetFailCount } from "./guards.ts";
import { admit } from "./gatekeeper.ts";
import { append } from "./historian.ts";
import { propose } from "./proposer.ts";
import { apply as reaperApply, dryRun } from "./reaper.ts";
import { diskWorsened, survey } from "./surveyor.ts";
import { CANONICAL_CRYPTO, CANONICAL_VAULT_SQL, DEFECTS, INITIAL_KNOWLEDGE, rankOf, STALE_CRYPTO_DOC, STALE_VAULT_SQL } from "./truth.ts";
import type { AdmittedInvariant, KernelState, ProbeSet, Proposal, RepairRecord } from "./types.ts";

export const PER_CYCLE = 2;

export function baseline(): KernelState {
  const state: KernelState = {
    cycle: 0,
    knowledge: { ...INITIAL_KNOWLEDGE },
    admitted: [],
    drafts: [],
    ledger: [],
    guardedIds: [],
  };
  const record: RepairRecord = {
    id: "cycle-0",
    cycle: 0,
    result: "held",
    durationMs: null,
    closed: [],
    proposed: [],
    blocked: [
      "Disk not re-probed. FORGE / last known 90% (233 GB). CRUCIBLE / last known 90% (110 GB of 128). echo_turbo last known 4% of 150 GB. On the operator for a fresh probe.",
      "SDK search tokens are stale on ECHO_MCP_BASIC_PASS, ECHO SHADOWGLASS, SHADOWGLASS, ECHO RUNPOD. On the operator: Disconnect, then Connect.",
      "15 of 16 live behavior failures were unnamed in the seed packet. Named: echo.logs.tail. The other 15 are not invented.",
      "Vault B preflight has not been run. On the operator, inside the FORGE jail, read-only. Any duplicate username stops the migration.",
    ],
    worse: [
      "Unconfirmed. FORGE and CRUCIBLE were last known at 90%. This session could not re-probe, so the hazard is not declared worse and not declared safe.",
    ],
    rollback: ["Nothing has been merged."],
    searches: [],
  };
  const written = append(state.ledger, record);
  return { ...state, ledger: written.ledger };
}

function invariantProposal(base: Proposal): Proposal {
  return {
    ...base,
    id: base.invariantId,
    kind: "invariant",
    title: base.title,
    changeSet: `Add invariant ${base.invariantId}. Fleet files are not modified.`,
    claimedTier: 0,
    rollback: `Revert local invariant ${base.invariantId}.`,
  };
}

function applyLocal(state: KernelState, defectId: string): KernelState {
  if (defectId === "stale-vault-lookup-doc") {
    return { ...state, knowledge: { ...state.knowledge, vaultLookup: CANONICAL_VAULT_SQL } };
  }
  if (defectId === "stale-crypto-doc") {
    return { ...state, knowledge: { ...state.knowledge, vaultCrypto: CANONICAL_CRYPTO } };
  }
  return state;
}

function revertLocal(state: KernelState, defectId: string): KernelState {
  if (defectId === "stale-vault-lookup-doc") {
    return { ...state, knowledge: { ...state.knowledge, vaultLookup: STALE_VAULT_SQL } };
  }
  if (defectId === "stale-crypto-doc") {
    return { ...state, knowledge: { ...state.knowledge, vaultCrypto: STALE_CRYPTO_DOC } };
  }
  return state;
}

export interface CycleOutcome {
  state: KernelState;
  record: RepairRecord;
}

export function runCycle(
  input: KernelState,
  probes?: ProbeSet,
  options?: { limit?: number; deferLocal?: boolean },
): CycleOutcome {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const picture = probes ?? { disks: survey().disks, worsened: [] };
  const worse = diskWorsened(picture);
  const cycle = input.cycle + 1;

  if (worse.length) {
    const record: RepairRecord = {
      id: `cycle-${cycle}`,
      cycle,
      result: "aborted",
      durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : started) - started),
      closed: [],
      proposed: [],
      blocked: ["Cycle aborted before propose. No merge."],
      worse,
      rollback: ["Nothing merged this cycle."],
      searches: [],
    };
    const written = append(input.ledger, record);
    return { state: { ...input, cycle, ledger: written.ledger }, record };
  }

  const open = DEFECTS.filter((d) => !input.guardedIds.includes(d.id))
    .filter((d) => !(options?.deferLocal && d.kind === "local-doc"))
    .sort((a, b) => rankOf(b) - rankOf(a));
  const limit = Math.min(Math.max(options?.limit ?? PER_CYCLE, 1), 4);
  const batch = open.slice(0, limit);
  if (batch.length === 0) {
    const record: RepairRecord = {
      id: `cycle-${cycle}`,
      cycle,
      result: "held",
      durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : started) - started),
      closed: [],
      proposed: [],
      blocked: ["Named seed backlog is guarded or drafted. Fleet files were not patched. Tier 2 still needs a human."],
      worse: [],
      rollback: ["Nothing merged this cycle."],
      searches: [],
    };
    const written = append(input.ledger, record);
    return { state: { ...input, cycle, ledger: written.ledger }, record };
  }

  const beforeRed = fleetFailCount(input);
  let state: KernelState = { ...input, cycle, drafts: [...input.drafts], admitted: [...input.admitted], guardedIds: [...input.guardedIds] };
  const closed: string[] = [];
  const proposed: string[] = [];
  const blocked: string[] = [];
  const rollback: string[] = [];
  const searches: string[] = [];
  let failedInvariant = false;

  for (const defect of batch) {
    const proposal = propose(defect);
    const proof = prove(proposal);
    searches.push(...proposal.searches);
    const inv = invariantProposal(proposal);
    const invGate = admit(inv, proof, false);
    if (!invGate.merged) {
      failedInvariant = true;
      blocked.push(`${defect.id}: invariant not admitted. ${invGate.reason}`);
      continue;
    }
    const admitted: AdmittedInvariant = {
      id: inv.invariantId,
      defectId: defect.id,
      title: defect.invariantTitle,
      failEvidence: proof.failEvidence,
      passEvidence: proof.passEvidence,
      cycle,
    };
    state = {
      ...state,
      admitted: [...state.admitted, admitted],
      guardedIds: [...state.guardedIds, defect.id],
    };
    closed.push(`${admitted.id}: ${admitted.title}`);
    rollback.push(inv.rollback);

    const changeGate = admit(proposal, proof, false);
    if (changeGate.action === "merge" && proposal.kind === "local-doc") {
      state = applyLocal(state, defect.id);
      closed.push(`Local packet updated for ${defect.id}. Fleet file not opened.`);
      rollback.push(proposal.rollback);
    } else if (changeGate.action === "draft") {
      if (!state.drafts.some((d) => d.defectId === defect.id)) {
        state = { ...state, drafts: [...state.drafts, proposal] };
      }
      proposed.push(`${proposal.id} tier ${changeGate.tier}. ${changeGate.reason}`);
      if (defect.blockedOn) blocked.push(`${defect.id}: ${defect.blockedOn}`);
    } else {
      blocked.push(`${defect.id}: ${changeGate.reason}`);
    }
  }

  const reaper = reaperApply(picture);
  blocked.push(reaper.reason);
  const afterRed = fleetFailCount(state);
  closed.unshift(`Red guards ${beforeRed} → ${afterRed}. Fleet code was not patched.`);

  const result = failedInvariant ? "degraded" : "improved";
  const record: RepairRecord = {
    id: `cycle-${cycle}`,
    cycle,
    result,
    durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : started) - started),
    closed,
    proposed,
    blocked,
    worse: [],
    rollback: rollback.length ? rollback : ["Nothing merged this cycle."],
    searches,
  };
  const written = append(state.ledger, record);
  if (written.refused) {
    return {
      state: input,
      record: {
        ...record,
        result: "degraded",
        closed: [],
        blocked: [written.reason ?? "Ledger refused the record."],
      },
    };
  }
  return { state: { ...state, ledger: written.ledger }, record };
}

export function rollbackLast(input: KernelState): CycleOutcome {
  const last = input.admitted[input.admitted.length - 1];
  const cycle = input.cycle + 1;
  if (!last) {
    const record: RepairRecord = {
      id: `cycle-${cycle}`,
      cycle,
      result: "held",
      durationMs: 0,
      closed: [],
      proposed: [],
      blocked: [],
      worse: [],
      rollback: ["Nothing merged to roll back."],
      searches: [],
    };
    const written = append(input.ledger, record);
    return { state: { ...input, cycle, ledger: written.ledger }, record };
  }
  let state: KernelState = {
    ...input,
    cycle,
    admitted: input.admitted.slice(0, -1),
    guardedIds: input.guardedIds.filter((id) => id !== last.defectId),
  };
  state = revertLocal(state, last.defectId);
  const record: RepairRecord = {
    id: `cycle-${cycle}`,
    cycle,
    result: "improved",
    durationMs: 0,
    closed: [],
    proposed: [],
    blocked: [],
    worse: [],
    rollback: [`Reverted local invariant ${last.id}. Fleet was never patched.`],
    searches: [],
  };
  const written = append(state.ledger, record);
  return { state: { ...state, ledger: written.ledger }, record };
}

export function acceptance(state: KernelState, proofsDiscriminated: number, proofCount: number): { phase: number; gaps: string[] } {
  const gaps: string[] = [];
  let phase = 1;
  if (proofsDiscriminated === proofCount && proofCount >= 8) phase = 2;
  else gaps.push(`Tamper proofs ${proofsDiscriminated}/${proofCount}. Phase 2 not claimed.`);
  if (phase >= 2 && state.guardedIds.length >= 10) phase = 3;
  else gaps.push(`Guarded defects ${state.guardedIds.length}/10. Phase 3 not claimed.`);
  if (phase >= 3 && state.admitted.length >= 20) phase = 4;
  else gaps.push(`Tier-0 admissions ${state.admitted.length}/20. Phase 4 not claimed.`);
  gaps.push("Phase 5 not claimed. Tier 2 never auto-merges.");
  return { phase, gaps };
}

export function reaperPreview(probes?: ProbeSet) {
  return dryRun(probes ?? { disks: survey().disks, worsened: [] });
}
