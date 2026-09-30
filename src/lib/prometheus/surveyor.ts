import { classifyConnector, classifyPath } from "./guards.ts";
import { CONTINUITY, LAST_KNOWN_DISK, MACHINES } from "./truth.ts";
import type { DiskProbe, ProbeSet } from "./types.ts";

export interface MachineSurvey {
  id: string;
  name: string;
  reach: string;
  walked: false;
  class: "jailed" | "unreachable" | "not-a-filesystem";
}

export interface ConnectorSurvey {
  name: string;
  connected: boolean;
  authError: string | null;
  classification: string;
  remediation: string;
}

export interface Survey {
  machines: MachineSurvey[];
  connectors: ConnectorSurvey[];
  continuity: typeof CONTINUITY;
  disks: DiskProbe[];
  pathChecks: { path: string; origin: "cloud" | "hammer"; classification: string }[];
  notes: string[];
}

export function sessionDisks(): DiskProbe[] {
  return [
    {
      id: "forge-root",
      mount: "/",
      fresh: false,
      pct: null,
      lastKnownPct: LAST_KNOWN_DISK.forgeRoot.pct,
      lastKnownNote: `FORGE ${LAST_KNOWN_DISK.forgeRoot.note}`,
    },
    {
      id: "crucible-root",
      mount: "/",
      fresh: false,
      pct: null,
      lastKnownPct: LAST_KNOWN_DISK.crucibleRoot.pct,
      lastKnownNote: `CRUCIBLE ${LAST_KNOWN_DISK.crucibleRoot.note}`,
    },
    {
      id: "echo-turbo",
      mount: "/mnt/echo_turbo",
      fresh: false,
      pct: null,
      lastKnownPct: LAST_KNOWN_DISK.echoTurbo.pct,
      lastKnownNote: LAST_KNOWN_DISK.echoTurbo.note,
    },
  ];
}

export function sessionProbes(): ProbeSet {
  return { disks: sessionDisks(), worsened: [] };
}

const STALE_CONNECTORS = [
  "ECHO_MCP_BASIC_PASS search",
  "ECHO SHADOWGLASS search",
  "SHADOWGLASS search",
  "ECHO RUNPOD search",
];

export function survey(probes: ProbeSet = sessionProbes()): Survey {
  const machines: MachineSurvey[] = MACHINES.map((machine) => {
    if (machine.id === "forge") {
      return { id: machine.id, name: machine.name, reach: machine.reach, walked: false, class: "jailed" };
    }
    if (machine.id === "hammer") {
      return {
        id: machine.id,
        name: machine.name,
        reach: machine.reach,
        walked: false,
        class: "not-a-filesystem",
      };
    }
    return {
      id: machine.id,
      name: machine.name,
      reach: machine.reach,
      walked: false,
      class: "unreachable",
    };
  });

  const connectors: ConnectorSurvey[] = [
    {
      name: "Echo Continuity Fabric",
      connected: true,
      authError: null,
      classification: classifyConnector(true, null),
      remediation: "None.",
    },
    ...STALE_CONNECTORS.map((name) => ({
      name,
      connected: true,
      authError: "Authentication required",
      classification: classifyConnector(true, "Authentication required"),
      remediation: "Disconnect, then Connect. Reconnecting alone reuses the dead token.",
    })),
  ];

  const pathChecks = [
    { path: "/home/forge/echo-worker-server/data/vault.db", origin: "cloud" as const },
    { path: "/etc/passwd", origin: "cloud" as const },
    { path: "/home/forge/../../etc/passwd", origin: "cloud" as const },
    { path: "C:/Users/Downloads/vault.db", origin: "hammer" as const },
    { path: "/home/anvil/data", origin: "cloud" as const },
  ].map((item) => ({ ...item, classification: classifyPath(item.path, item.origin) }));

  return {
    machines,
    connectors,
    continuity: CONTINUITY,
    disks: probes.disks,
    pathChecks,
    notes: [
      "Survey is read-only. No host was walked this session.",
      "ANVIL and CRUCIBLE filesystems are unreachable from cloud. That is not a connector fault.",
      "Downloads is HAMMER. It is not searched on FORGE.",
      `Continuity Fabric chain ${CONTINUITY.chainOk ? "ok" : "broken"}, ledger ${CONTINUITY.ledgerHead}, open attention ${CONTINUITY.openAttention}, reminders due ${CONTINUITY.remindersDue}.`,
    ],
  };
}

export function diskWorsened(probes: ProbeSet): string[] {
  const lines: string[] = [];
  for (const disk of probes.disks) {
    if (!disk.fresh || disk.pct === null) continue;
    if (disk.pct > disk.lastKnownPct && disk.pct >= 90) {
      lines.push(
        `${disk.id} ${disk.mount} is ${disk.pct}% fresh, last known ${disk.lastKnownPct}%. Hazard worsened.`,
      );
    }
  }
  return lines;
}
