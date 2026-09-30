import { searchFunctions } from "./librarian.ts";
import { DEFECTS, type DefectSeed } from "./truth.ts";
import type { Proposal } from "./types.ts";

export function propose(defect: DefectSeed): Proposal {
  const search = searchFunctions(defect.search);
  if (defect.decision === "SUPERSEDE" && defect.gotRight.trim().length === 0) {
    throw new Error(`SUPERSEDE without what the old line got right: ${defect.id}`);
  }
  if (defect.decision !== "NONE" && search.hitCount === 0) {
    throw new Error(`Proposal ${defect.id} claimed a library hit and the search was empty.`);
  }
  return {
    id: `proposal-${defect.id}`,
    defectId: defect.id,
    kind: defect.kind,
    title: defect.title,
    rationale: defect.evidence,
    blastRadius: defect.blastRadius,
    rollback: defect.rollback,
    invariantId: `inv-${defect.id}`,
    searches: [search.verbatim],
    decision: defect.decision,
    reuseId: defect.reuseId,
    gotRight: defect.gotRight,
    changeSet: defect.changeSet,
    claimedTier: defect.kind === "local-doc" ? 0 : 2,
  };
}

export function proposalFor(id: string): Proposal {
  const defect = DEFECTS.find((d) => d.id === id);
  if (!defect) throw new Error(`Unknown defect ${id}`);
  return propose(defect);
}
