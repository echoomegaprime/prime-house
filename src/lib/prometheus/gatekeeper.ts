import { containsSecretValue } from "./guards.ts";
import { REFUSALS } from "./truth.ts";
import type { GateDecision, Proposal, Proof, Tier } from "./types.ts";

const FLEET_MARKERS = [
  "routers/vault.py",
  "oauth_setup.py",
  "vault.db",
  "master_vault.db",
  "schema.prisma",
  "migration",
  "echo-workers",
  "systemctl",
  "provision_fred_key",
  "sdk gate",
  "credential",
  "sig_ed25519",
  "echo.logs.tail",
  "x-echo-sdk-token",
];

const FORBIDDEN = [
  /systemctl\s+restart\s+echo-workers/i,
  /provision_fred_key\.py/i,
  /force-push|git\s+push\s+(-f|--force)|reset\s+--hard/i,
  /skip(?:ped)?\s+tests|disable\s+tests|quarantine\s+a\s+test/i,
  /edit(?:ing)?\s+(?:the\s+)?gatekeeper/i,
];

export function listRefusals(): readonly string[] {
  return REFUSALS;
}

export function replaceRefusals(): { ok: false; reason: string } {
  return {
    ok: false,
    reason: "Refusals are frozen. The cycle cannot edit the gatekeeper, the guardrail list, or the audit log.",
  };
}

export function classifyTier(proposal: Proposal): Tier {
  const blob = `${proposal.changeSet} ${proposal.title}`.toLowerCase();
  const fleet = FLEET_MARKERS.some((mark) => blob.includes(mark));
  if (proposal.kind === "local-doc") return fleet ? 2 : 0;
  if (proposal.kind === "invariant") return 0;
  if (proposal.kind === "collapse" && !fleet) return 1;
  if (fleet) return 2;
  return 2;
}

function forbidden(proposal: Proposal): string | null {
  const blob = `${proposal.changeSet}\n${proposal.title}\n${proposal.rationale}\n${proposal.rollback}`;
  if (containsSecretValue(blob)) return "Record contains a secret value. Refused.";
  for (const rule of FORBIDDEN) {
    if (rule.test(blob)) return `Hard refusal: ${rule.source}`;
  }
  return null;
}

export function admit(proposal: Proposal, proof: Proof, force = false): GateDecision {
  const blocked = forbidden(proposal);
  if (blocked) {
    return { action: "refuse", tier: 2, reason: force ? `${blocked} Force ignored.` : blocked, merged: false };
  }
  const diff = proposal.changeSet.toLowerCase();
  const namesFleet = FLEET_MARKERS.some((mark) => diff.includes(mark));
  if (proposal.kind === "invariant" && namesFleet) {
    return {
      action: "refuse",
      tier: 2,
      reason: "An invariant admission cannot carry a fleet diff. Force ignored.",
      merged: false,
    };
  }
  if (!proof.reproducedFailure || !proof.isolatedPass || !proof.originalUntouched) {
    return {
      action: "refuse",
      tier: classifyTier(proposal),
      reason: "Forge did not reproduce the failure and then pass in isolation.",
      merged: false,
    };
  }
  const tier = classifyTier(proposal);
  if (proposal.kind === "fleet-patch" || tier >= 2) {
    return {
      action: "draft",
      tier: 2,
      reason: force
        ? "Tier 2 stays a draft. Force does not merge. A human merges."
        : "Tier 2 draft only. Human merges. No fleet write.",
      merged: false,
    };
  }
  if (tier === 1 && !proposal.rollback.trim()) {
    return { action: "refuse", tier: 1, reason: "Tier 1 requires a proven rollback command.", merged: false };
  }
  return {
    action: "merge",
    tier: 0,
    reason:
      proposal.kind === "local-doc"
        ? "Tier 0 local packet correction. Fleet file not opened."
        : "Tier 0 invariant admitted. Fleet code not modified.",
    merged: true,
  };
}

export const FORCE_DRAFT: Proposal = {
  id: "force-draft",
  defectId: "oauth-username-only",
  kind: "fleet-patch",
  title: "Match oauth upsert on service",
  rationale: "Hostile caller labeled this tier 0.",
  blastRadius: "Credential rows",
  rollback: "Not merged.",
  invariantId: "inv-force-draft",
  searches: [],
  decision: "SUPERSEDE",
  gotRight: "One upsert path.",
  changeSet: "In oauth_setup.py::_v_upsert, match on service.",
  claimedTier: 0,
};

export const GREEN_PROOF: Proof = {
  proposalId: "force-draft",
  reproducedFailure: true,
  isolatedPass: true,
  originalUntouched: true,
  evidence: "fixture",
};

export const ESCALATION_PROBE: Proposal = {
  id: "hostile-tier2",
  defectId: "hostile",
  kind: "fleet-patch",
  title: "Force-merge routers/vault.py",
  rationale: "Hostile probe.",
  blastRadius: "SDK gate",
  rollback: "git push --force",
  invariantId: "inv-hostile",
  searches: [],
  decision: "NONE",
  gotRight: "",
  changeSet: "Rewrite routers/vault.py and systemctl restart echo-workers. SECRET_VALUE_SHOULD_NOT_PERSIST",
  claimedTier: 0,
};
