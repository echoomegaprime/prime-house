import type { FnRecord, Knowledge } from "./types.ts";

/** Ground truth from the stand packet. Counts are prior-stand unless a probe says fresh. */

export const MACHINES = [
  {
    id: "forge",
    name: "FORGE",
    os: "Ubuntu 24.04",
    tailscale: "100.113.87.107",
    lan: "192.168.1.137",
    hardware: "i7-12700K · RTX 4080 + RTX 3070 · 32 GB",
    role: "Hosts the SDK gate",
    reach: "Cloud session is jailed to /home/forge. Paths above that root escape.",
  },
  {
    id: "anvil",
    name: "ANVIL",
    os: "Ubuntu 24.04",
    tailscale: "100.99.78.44",
    lan: "LAN .96 is dead",
    hardware: "RTX 4070 Ti SUPER · MinIO :9000",
    role: "Object store",
    reach: "Filesystem is not reachable from a cloud session.",
  },
  {
    id: "crucible",
    name: "CRUCIBLE",
    os: "Kali Rolling 2025.4",
    tailscale: "100.125.238.91",
    lan: "Multi-homed, includes 192.168.7.0/22",
    hardware: "Hostname is still CHARLIE",
    role: "Worker",
    reach: "Filesystem is not reachable from a cloud session.",
  },
  {
    id: "hammer",
    name: "HAMMER",
    os: "Windows",
    tailscale: "Not a cloud filesystem target",
    lan: "Local disks only",
    hardware: "O:\\ I:\\ J:\\ H:\\ P:\\ X:\\ and Downloads",
    role: "Commander workstation",
    reach: "Not filesystem-reachable from a cloud session. Downloads means HAMMER.",
  },
] as const;

export const JAIL_ROOT = "/home/forge";

export const LAST_KNOWN_DISK = {
  forgeRoot: { pct: 90, note: "233 GB. Last known, not re-probed." },
  crucibleRoot: { pct: 90, note: "110 GB on a 128 GB SSD. Last known, not re-probed." },
  echoTurbo: { pct: 4, note: "150 GB at /mnt/echo_turbo. Only stated headroom. Last known." },
} as const;

export const VAULT_A = {
  path: "/home/forge/echo-worker-server/data/vault.db",
  pk: "service",
  crypto: "PyNaCl SecretBox (XSalsa20-Poly1305)",
  field: "secret_enc",
} as const;

export const VAULT_B = {
  name: "master_vault.db",
  state: "legacy, mid-decommission, plaintext",
  pk: "service + username",
} as const;

export const STALE_VAULT_SQL = "WHERE service=? AND username=?";
export const CANONICAL_VAULT_SQL = "WHERE service=?";
export const STALE_CRYPTO_DOC = "AES-256-GCM";
export const CANONICAL_CRYPTO = "PyNaCl SecretBox (XSalsa20-Poly1305)";

export const PREFLIGHT_SQL =
  "SELECT service, COUNT(DISTINCT username) n FROM credentials GROUP BY service HAVING n > 1";

export const REFUSALS = Object.freeze([
  "never systemctl restart echo-workers",
  "never run SYSTEMS/secrets_vault/provision_fred_key.py",
  "never print, log, or persist a secret value",
  "never skip, disable, or quarantine a test to reach green",
  "never edit the gatekeeper, the guardrail list, or the audit log",
  "never force-push, rewrite history, or delete a branch this system did not create",
]);

export const CORPUS: FnRecord[] = [
  {
    id: "10001",
    path: "precedent/rah-midland-pr-8",
    signature: "assert_sql_against_migrations(source, migrations)",
    docstring:
      "Parse SQL from source and assert every table, column, and ON CONFLICT target exists in a migration. Discriminates when the migration is removed, a column is dropped, or a unique index is removed.",
    intents: ["schema", "migration", "sql", "conformance", "prisma", "property"],
    gotRight: "It fails closed on a missing relation instead of trusting a green unit suite.",
  },
  {
    id: "10002",
    path: "routers/vault.py",
    signature: "import vault_credential_manager",
    docstring:
      "Line 69 imports vault_credential_manager. The module is absent from the repo. Called at lines 1622-1628. File is 3819 lines and the SDK gate is OOM-sensitive.",
    intents: ["vault", "import", "credential", "sdk", "gate"],
    gotRight: "The call site is explicit. The missing module is not a reason to inline a second vault.",
  },
  {
    id: "10003",
    path: "oauth_setup.py::_v_upsert",
    signature: "_v_upsert(username)",
    docstring:
      "Upsert matches on username alone, so it can overwrite another service's credential.",
    intents: ["oauth", "upsert", "credential", "username", "service"],
    gotRight: "One upsert path, not a split insert and update.",
  },
  {
    id: "10004",
    path: "vault/crypto",
    signature: "SecretBox",
    docstring:
      "Vault crypto in code is PyNaCl SecretBox using XSalsa20-Poly1305. Docs that say AES-256-GCM are wrong.",
    intents: ["crypto", "secretbox", "nacl", "aes", "vault"],
    gotRight: "The code, not the doc, is the source of truth for the cipher.",
  },
  {
    id: "10005",
    path: "echo.logs.tail",
    signature: "echo.logs.tail",
    docstring: "Live behavior: echo.logs.tail never terminates. No timeout is declared.",
    intents: ["logs", "tail", "timeout", "await", "unbounded"],
    gotRight: "A tail is the right shape for logs. It still needs a bound.",
  },
  {
    id: "10006",
    path: "capability/contract-tokens",
    signature: "echo.engine.:id",
    docstring:
      "Prior stand: 52 critical capability contract defects. The literal unsubstituted token echo.engine.:id is one. sig_ed25519 is null for all 13731 capabilities. Not re-counted this session.",
    intents: ["capability", "token", "ed25519", "contract", "sig"],
    gotRight: "The token names the engine slot. The substitution and the signature are what failed.",
  },
  {
    id: "10007",
    path: "headers/rfc9110",
    signature: "X-Echo-SDK-Token",
    docstring:
      "Prior stand counted X-Echo-SDK-Token 19 times and X-Echo-Sdk-Token 18 times. RFC 9110 section 5.1: header names are case-insensitive. That is one header, 37 caps.",
    intents: ["header", "token", "case", "scanner", "secret"],
    gotRight: "Both spellings were counted. The scanner must collapse them.",
  },
  {
    id: "10008",
    path: "survey/jail",
    signature: "classify_path(path, origin)",
    docstring:
      "A cloud session on FORGE is jailed to /home/forge. ANVIL and CRUCIBLE filesystems are unreachable from cloud. Downloads is HAMMER. Authentication required while connected is a stale token.",
    intents: ["jail", "path", "forge", "hammer", "connector", "auth"],
    gotRight: "Reachability and auth are different failure classes.",
  },
];

export interface DefectSeed {
  id: string;
  title: string;
  evidence: string;
  blast: number;
  confidence: number;
  size: number;
  search: string;
  decision: "REUSE" | "EXTEND" | "SUPERSEDE" | "NONE";
  reuseId?: string;
  gotRight: string;
  kind: "fleet-patch" | "local-doc";
  changeSet: string;
  blastRadius: string;
  rollback: string;
  invariantTitle: string;
  blockedOn?: string;
}

export const DEFECTS: DefectSeed[] = [
  {
    id: "oauth-username-only",
    title: "oauth upsert matches username alone",
    evidence:
      "oauth_setup.py::_v_upsert matches on username alone and can overwrite another service's credential.",
    blast: 90,
    confidence: 80,
    size: 2,
    search: "upsert credential match service username",
    decision: "SUPERSEDE",
    reuseId: "10003",
    gotRight: "One upsert path, not a split insert and update.",
    kind: "fleet-patch",
    changeSet:
      "In oauth_setup.py::_v_upsert, match on service. Do not match on username alone. Carry the single upsert forward.",
    blastRadius: "Credential rows. Wrong match can destroy another service's secret.",
    rollback: "Not merged on the fleet. Revert the local invariant oauth-username-only if admitted.",
    invariantTitle: "oauth_setup.py::_v_upsert must match on service, never username alone",
  },
  {
    id: "vault-import-missing",
    title: "vault.py imports a module the repo does not contain",
    evidence:
      "routers/vault.py:69 imports vault_credential_manager, absent from the repo, called at 1622-1628. Blocks any echo-workers restart. Restart is refused.",
    blast: 85,
    confidence: 75,
    size: 2,
    search: "vault credential manager import",
    decision: "EXTEND",
    reuseId: "10002",
    gotRight: "The call site is explicit. Do not inline a second vault.",
    kind: "fleet-patch",
    changeSet:
      "Restore or relocate vault_credential_manager so the import resolves. Do not reimplement it inside routers/vault.py. Do not restart echo-workers.",
    blastRadius: "SDK gate process. File is 3819 lines and OOM-sensitive.",
    rollback: "Not merged on the fleet. No restart command exists.",
    invariantTitle: "routers/vault.py:69 import vault_credential_manager must resolve",
    blockedOn: "Module body was not in the stand packet. Do not invent one.",
  },
  {
    id: "logs-tail-unbounded",
    title: "echo.logs.tail never terminates",
    evidence:
      "16 confirmed live behavior failures in the prior stand. The only one named here is echo.logs.tail, which never terminates. The other 15 are not named and are not invented.",
    blast: 70,
    confidence: 70,
    size: 2,
    search: "logs tail timeout unbounded await",
    decision: "SUPERSEDE",
    reuseId: "10005",
    gotRight: "A tail is the right shape. It needs a bound.",
    kind: "fleet-patch",
    changeSet: "Give echo.logs.tail an explicit timeout and a typed failure when the bound hits.",
    blastRadius: "Any caller that awaits the tail.",
    rollback: "Not merged on the fleet. Revert local invariant logs-tail-bounded.",
    invariantTitle: "echo.logs.tail must declare a timeout and terminate",
  },
  {
    id: "header-case-split",
    title: "Secret scanner splits one header into two",
    evidence:
      "Prior stand: X-Echo-SDK-Token 19 and X-Echo-Sdk-Token 18. RFC 9110 §5.1 says one header, 37 caps. A case-sensitive scanner under-reports by half.",
    blast: 60,
    confidence: 90,
    size: 2,
    search: "header token case insensitive scanner",
    decision: "SUPERSEDE",
    reuseId: "10007",
    gotRight: "Both spellings were found. Collapse them; do not drop either count.",
    kind: "fleet-patch",
    changeSet: "Compare header names case-insensitively. Report one header and the summed count.",
    blastRadius: "Secret scanner. Case-folding only; do not log header values.",
    rollback: "Not merged on the fleet. Revert local invariant header-case-insensitive.",
    invariantTitle: "X-Echo-SDK-Token and X-Echo-Sdk-Token are one header",
  },
  {
    id: "schema-count-gap",
    title: "33 Prisma models, 20 migrated tables",
    evidence:
      "rah-midland: 33 Prisma models versus 20 migrated tables. Property and about 12 baseline models are unmigrated. Names beyond Property were not in the stand packet.",
    blast: 75,
    confidence: 85,
    size: 6,
    search: "schema migration sql conformance property prisma",
    decision: "REUSE",
    reuseId: "10001",
    gotRight: "The conformance guard fails on the missing relation instead of trusting unit tests.",
    kind: "fleet-patch",
    changeSet:
      "Add the missing migrations, including Property. Do not claim the other unnamed models. Reuse the SQL conformance guard.",
    blastRadius: "rah-midland schema. A migration is tier 2.",
    rollback: "Not merged. No migration was applied.",
    invariantTitle: "Declared model count must equal migrated table count; Property must be migrated",
  },
  {
    id: "capability-contracts",
    title: "Unsubstituted capability token and null signatures",
    evidence:
      "Prior stand, not re-counted: 52 critical capability contract defects, including the literal echo.engine.:id. sig_ed25519 is null for all 13731 capabilities.",
    blast: 80,
    confidence: 60,
    size: 8,
    search: "capability contract token ed25519 unsubstituted",
    decision: "EXTEND",
    reuseId: "10006",
    gotRight: "The token names a real engine slot. Substitution and the signature are the gap.",
    kind: "fleet-patch",
    changeSet:
      "Reject unsubstituted tokens and null sig_ed25519 at admit time. Do not ship a new signer from this kernel.",
    blastRadius: "Capability admit path on the SDK gate.",
    rollback: "Not merged on the fleet.",
    invariantTitle: "Capability tokens must be substituted and sig_ed25519 must not be null",
  },
  {
    id: "vault-b-preflight",
    title: "Vault B migration has no duplicate preflight",
    evidence:
      "Vault A PK is service alone. Vault B allows many usernames per service. A straight copy drops credentials if any service has two usernames. Preflight has not been run.",
    blast: 95,
    confidence: 70,
    size: 4,
    search: "vault credential migration duplicate username preflight",
    decision: "REUSE",
    reuseId: "10002",
    gotRight: "Vault A is canonical and encrypted. Vault B is the legacy store.",
    kind: "fleet-patch",
    changeSet: `Do not migrate. On FORGE, inside the jail, run: ${PREFLIGHT_SQL}. Any row means stop.`,
    blastRadius: "Every credential. Loss is silent if the preflight is skipped.",
    rollback: "Not migrated. Nothing to restore.",
    invariantTitle: "Vault B must not migrate until the duplicate-username preflight returns zero rows",
    blockedOn: "Operator on FORGE. Read-only query. This kernel will not open vault.db.",
  },
  {
    id: "stale-vault-lookup-doc",
    title: "Stand packet still quotes the Vault B lookup",
    evidence: `Local stand packet lookup is "${STALE_VAULT_SQL}". Vault A PK is service alone. The fleet CLAUDE.md was not opened.`,
    blast: 40,
    confidence: 95,
    size: 3,
    search: "vault lookup service username where clause",
    decision: "SUPERSEDE",
    reuseId: "10004",
    gotRight: "The packet recorded the stale snippet instead of forgetting it.",
    kind: "local-doc",
    changeSet: `Replace the local packet lookup with "${CANONICAL_VAULT_SQL}". Do not edit fleet CLAUDE.md from here.`,
    blastRadius: "Local stand packet only.",
    rollback: "Restore the local packet lookup to the stale snippet.",
    invariantTitle: "Local vault lookup must key on service alone",
  },
  {
    id: "stale-crypto-doc",
    title: "Stand packet still claims AES-256-GCM",
    evidence: `Local stand packet crypto says ${STALE_CRYPTO_DOC}. Code is ${CANONICAL_CRYPTO}. The wrong doc's path was not in the packet.`,
    blast: 35,
    confidence: 95,
    size: 3,
    search: "vault crypto secretbox aes",
    decision: "SUPERSEDE",
    reuseId: "10004",
    gotRight: "The disagreement was preserved. The code wins.",
    kind: "local-doc",
    changeSet: `Set the local packet crypto to ${CANONICAL_CRYPTO}. Do not invent a fleet doc path.`,
    blastRadius: "Local stand packet only.",
    rollback: "Restore the local packet crypto string to AES-256-GCM.",
    invariantTitle: "Local crypto line must be PyNaCl SecretBox, not AES-256-GCM",
  },
  {
    id: "stale-connector-token",
    title: "SDK search connectors are connected and unauthenticated",
    evidence:
      "This session: Echo SDK search on ECHO_MCP_BASIC_PASS, ECHO SHADOWGLASS, SHADOWGLASS, and ECHO RUNPOD returned Authentication required. Continuity Fabric answered. Connected plus Authentication required is a stale token, not a missing connector.",
    blast: 55,
    confidence: 92,
    size: 3,
    search: "connector authentication required stale token jail",
    decision: "REUSE",
    reuseId: "10008",
    gotRight: "The tools were listed. The failure is the token, not the wiring.",
    kind: "fleet-patch",
    changeSet:
      "No code change. Operator disconnects, then connects, those four connectors. Reconnecting alone reuses the dead token.",
    blastRadius: "SDK search and the weekly fleet health routine that trusts a cached manifest.",
    rollback: "No write performed.",
    invariantTitle:
      "connected=true with Authentication required is classified stale-token, never as absent",
    blockedOn: "Operator. Disconnect, then Connect. Do not reconnect in place.",
  },
];

export const CONTINUITY = {
  source: "Echo Continuity Fabric",
  events: 698,
  ledgerHead: 698,
  openAttention: 35,
  remindersDue: 4,
  chainOk: true,
  retrieval: "1.0.0",
  skills: [
    { slug: "historical-chat-recovery", version: "1.3.0", status: "CERTIFIED", success: 0.86 },
    { slug: "artifact-provenance", version: "1.1.0", status: "ACTIVE", success: 0.94 },
    { slug: "provider-mcp-adapter", version: "0.9.0", status: "TESTING", success: 0.67 },
    { slug: "continuity-bootstrap", version: "1.0.0", status: "CERTIFIED", success: 0.99 },
    { slug: "maximalist-deliberation", version: "0.4.0", status: "CANDIDATE", success: null },
  ],
} as const;

export const INITIAL_KNOWLEDGE: Knowledge = {
  vaultLookup: STALE_VAULT_SQL,
  vaultCrypto: STALE_CRYPTO_DOC,
};

export function rankOf(d: { blast: number; confidence: number; size: number }): number {
  return (d.blast * d.confidence) / d.size;
}
