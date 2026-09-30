import type { ProbeSet } from "./types.ts";

export interface ReaperPlan {
  applied: false;
  bytes: 0;
  lines: string[];
}

/** Preview only. This kernel will not invent paths it has not inventoried. */
export function dryRun(probes: ProbeSet): ReaperPlan {
  const lines = probes.disks.map((disk) => {
    const fresh = disk.fresh && disk.pct !== null ? `${disk.pct}% fresh` : `last known ${disk.lastKnownPct}%, not re-probed`;
    return `${disk.id} ${disk.mount}: ${fresh}. ${disk.lastKnownNote} No deletion set — paths were not inventoried.`;
  });
  return { applied: false, bytes: 0, lines };
}

export function apply(probes: ProbeSet): { applied: false; reason: string } {
  const stale = probes.disks.filter((d) => !d.fresh);
  if (stale.length) {
    return {
      applied: false,
      reason: `Apply blocked. ${stale.map((d) => d.id).join(", ")} not re-probed. Deleting from a stale picture can hit the wrong disk.`,
    };
  }
  const hot = probes.disks.filter((d) => d.pct !== null && d.pct > 92);
  if (hot.length) {
    return {
      applied: false,
      reason: `Apply blocked. ${hot.map((d) => `${d.id} ${d.pct}%`).join(", ")} is above 92%.`,
    };
  }
  return {
    applied: false,
    reason: "Apply blocked. No inventoried deletion set. Refusing to invent paths.",
  };
}
