export type PhaseName =
  | "survey"
  | "diagnose"
  | "propose"
  | "prove"
  | "gate"
  | "merge"
  | "learn";

export type GuardStatus = "pass" | "fail" | "unprobed";

export type Tier = 0 | 1 | 2;

export type ProposalKind = "invariant" | "fleet-patch" | "local-doc" | "collapse";

export type GateAction = "merge" | "draft" | "refuse";

export interface GuardResult {
  id: string;
  title: string;
  status: GuardStatus;
  evidence: string;
}

export interface TamperCase {
  name: string;
  failed: boolean;
  restored: boolean;
  evidence: string;
}

export interface TamperProof {
  id: string;
  discriminated: boolean;
  cases: TamperCase[];
}

export interface FnRecord {
  id: string;
  path: string;
  signature: string;
  docstring: string;
  intents: string[];
  gotRight: string;
}

export interface SearchHit {
  id: string;
  path: string;
  score: number;
  docstring: string;
}

export interface SearchResult {
  q: string;
  hitCount: number;
  hits: SearchHit[];
  verbatim: string;
}

export interface Proposal {
  id: string;
  defectId: string;
  kind: ProposalKind;
  title: string;
  rationale: string;
  blastRadius: string;
  rollback: string;
  invariantId: string;
  searches: string[];
  decision: "REUSE" | "EXTEND" | "SUPERSEDE" | "NONE";
  reuseId?: string;
  gotRight: string;
  changeSet: string;
  claimedTier: Tier;
}

export interface Proof {
  proposalId: string;
  reproducedFailure: boolean;
  isolatedPass: boolean;
  originalUntouched: boolean;
  evidence: string;
}

export interface GateDecision {
  action: GateAction;
  tier: Tier;
  reason: string;
  merged: boolean;
}

export interface AdmittedInvariant {
  id: string;
  defectId: string;
  title: string;
  failEvidence: string;
  passEvidence: string;
  cycle: number;
}

export interface RepairRecord {
  id: string;
  cycle: number;
  result: "improved" | "held" | "degraded" | "aborted";
  durationMs: number | null;
  closed: string[];
  proposed: string[];
  blocked: string[];
  worse: string[];
  rollback: string[];
  searches: string[];
}

export interface Knowledge {
  vaultLookup: string;
  vaultCrypto: string;
}

export interface KernelState {
  cycle: number;
  knowledge: Knowledge;
  admitted: AdmittedInvariant[];
  drafts: Proposal[];
  ledger: RepairRecord[];
  guardedIds: string[];
}

export interface DiskProbe {
  id: string;
  mount: string;
  fresh: boolean;
  pct: number | null;
  lastKnownPct: number;
  lastKnownNote: string;
}

export interface ProbeSet {
  disks: DiskProbe[];
  worsened: string[];
}
