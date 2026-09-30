import type { GuardResult, KernelState, TamperProof } from "./types.ts";
import {
  CANONICAL_CRYPTO,
  CANONICAL_VAULT_SQL,
  PREFLIGHT_SQL,
  STALE_CRYPTO_DOC,
  STALE_VAULT_SQL,
} from "./truth.ts";

export interface SqlTable {
  name: string;
  columns: string[];
  uniques: string[][];
}

export interface SqlQuery {
  source: string;
  sql: string;
}

export interface SchemaFixture {
  tables: SqlTable[];
  queries: SqlQuery[];
}

export interface HeaderFixture {
  caseSensitive: boolean;
  sdkTokenCount: number;
  sdkTokenFoldCount: number;
}

export interface ProcessFixture {
  id: string;
  timeoutMs: number | null;
  terminates: boolean;
}

const WIDGET: SchemaFixture = {
  tables: [{ name: "Widget", columns: ["id", "name"], uniques: [["id"]] }],
  queries: [
    {
      source: "fixture",
      sql: 'INSERT INTO "Widget" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"',
    },
  ],
};

function quote(ids: string[]): string {
  return ids.length ? ids.join(", ") : "none";
}

export function parseSql(sql: string): { tables: string[]; columns: string[]; conflicts: string[] } {
  const tables: string[] = [];
  const columns: string[] = [];
  const conflicts: string[] = [];
  const tableRe = /\b(?:FROM|INTO|UPDATE|JOIN)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
  const skip = new Set(["set", "where", "do", "on", "values", "select"]);
  for (const match of sql.matchAll(tableRe)) {
    if (skip.has(match[1].toLowerCase())) continue;
    if (!tables.includes(match[1])) tables.push(match[1]);
  }
  const insertRe = /\bINSERT\s+INTO\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s*\(([^)]+)\)/gi;
  for (const match of sql.matchAll(insertRe)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().replaceAll('"', "");
      if (name && !columns.includes(name)) columns.push(name);
    }
  }
  const conflictRe = /\bON\s+CONFLICT\s*\(([^)]+)\)/gi;
  for (const match of sql.matchAll(conflictRe)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().replaceAll('"', "");
      if (name) conflicts.push(name);
    }
  }
  return { tables, columns, conflicts };
}

export function checkSqlFixture(fix: SchemaFixture): GuardResult {
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingUniques: string[] = [];
  for (const query of fix.queries) {
    const parsed = parseSql(query.sql);
    for (const table of parsed.tables) {
      const found = fix.tables.find((t) => t.name === table);
      if (!found) {
        missingTables.push(`${table} (${query.source})`);
        continue;
      }
      for (const column of parsed.columns) {
        if (!found.columns.includes(column)) missingColumns.push(`${table}.${column}`);
      }
      if (parsed.conflicts.length) {
        const ok = found.uniques.some(
          (unique) =>
            unique.length === parsed.conflicts.length &&
            unique.every((col, i) => col === parsed.conflicts[i]),
        );
        if (!ok) missingUniques.push(`${table} (${parsed.conflicts.join(", ")})`);
      }
    }
  }
  if (missingTables.length || missingColumns.length || missingUniques.length) {
    const parts = [
      missingTables.length ? `missing table ${quote(missingTables)}` : "",
      missingColumns.length ? `missing column ${quote(missingColumns)}` : "",
      missingUniques.length ? `ON CONFLICT has no unique index on ${quote(missingUniques)}` : "",
    ].filter(Boolean);
    return {
      id: "sql-migration-conformance",
      title: "SQL matches migrations",
      status: "fail",
      evidence: parts.join("; "),
    };
  }
  return {
    id: "sql-migration-conformance",
    title: "SQL matches migrations",
    status: "pass",
    evidence: `${fix.queries.length} statement(s) match ${fix.tables.length} migrated table(s).`,
  };
}

export function checkSchemaGap(input: {
  declared: number;
  migrated: number;
  namedUnmigrated: string[];
}): GuardResult {
  if (input.declared === input.migrated && input.namedUnmigrated.length === 0) {
    return {
      id: "schema-count-gap",
      title: "Declared models match migrated tables",
      status: "pass",
      evidence: `${input.declared} declared, ${input.migrated} migrated.`,
    };
  }
  const named = input.namedUnmigrated.length
    ? ` Named unmigrated: ${input.namedUnmigrated.join(", ")}.`
    : "";
  return {
    id: "schema-count-gap",
    title: "Declared models match migrated tables",
    status: "fail",
    evidence: `${input.declared} Prisma models vs ${input.migrated} migrated tables.${named}`,
  };
}

export function checkHeaders(fix: HeaderFixture): GuardResult {
  const logical = fix.caseSensitive ? 2 : 1;
  const reported = fix.caseSensitive
    ? fix.sdkTokenCount + fix.sdkTokenFoldCount
    : fix.sdkTokenCount + fix.sdkTokenFoldCount;
  if (fix.caseSensitive) {
    return {
      id: "secret-header-case",
      title: "SDK token header is case-insensitive",
      status: "fail",
      evidence: `Scanner split one header into ${logical} names: X-Echo-SDK-Token ${fix.sdkTokenCount} and X-Echo-Sdk-Token ${fix.sdkTokenFoldCount} (${reported} caps, RFC 9110 §5.1).`,
    };
  }
  return {
    id: "secret-header-case",
    title: "SDK token header is case-insensitive",
    status: "pass",
    evidence: `One header, ${reported} caps, case-folded.`,
  };
}

export function checkTokens(tokens: string[], sigNull: number | null): GuardResult {
  const bad = tokens.filter((token) => token.includes(":id") || token.includes("..") || token.endsWith("."));
  if (sigNull === null) {
    return {
      id: "capability-tokens",
      title: "Capability tokens and signatures",
      status: "unprobed",
      evidence: "Signature count was not re-probed.",
    };
  }
  if (bad.length || sigNull > 0) {
    return {
      id: "capability-tokens",
      title: "Capability tokens and signatures",
      status: "fail",
      evidence: `Unsubstituted: ${quote(bad)}. sig_ed25519 null on ${sigNull} capabilities (prior stand, not re-counted).`,
    };
  }
  return {
    id: "capability-tokens",
    title: "Capability tokens and signatures",
    status: "pass",
    evidence: `${tokens.length} tokens substituted. sig_ed25519 null count is 0.`,
  };
}

export function checkProcess(fix: ProcessFixture): GuardResult {
  if (fix.timeoutMs === null || !fix.terminates) {
    return {
      id: "bounded-await",
      title: "Network and IPC calls are bounded",
      status: "fail",
      evidence: `${fix.id} timeout=${fix.timeoutMs === null ? "none" : fix.timeoutMs} terminates=${fix.terminates}.`,
    };
  }
  return {
    id: "bounded-await",
    title: "Network and IPC calls are bounded",
    status: "pass",
    evidence: `${fix.id} timeout ${fix.timeoutMs} ms and terminates.`,
  };
}

export function checkImport(module: string, resolved: boolean, at: string): GuardResult {
  if (!resolved) {
    return {
      id: "import-resolved",
      title: "Imports resolve",
      status: "fail",
      evidence: `${at} imports ${module}, which is absent.`,
    };
  }
  return {
    id: "import-resolved",
    title: "Imports resolve",
    status: "pass",
    evidence: `${module} resolves.`,
  };
}

export function checkOauthKeys(keys: string[]): GuardResult {
  if (!keys.includes("service") || (keys.length === 1 && keys[0] === "username")) {
    return {
      id: "oauth-match-key",
      title: "Credential upsert matches on service",
      status: "fail",
      evidence: `Match keys: ${quote(keys)}. Username alone can overwrite another service.`,
    };
  }
  return {
    id: "oauth-match-key",
    title: "Credential upsert matches on service",
    status: "pass",
    evidence: `Match keys: ${quote(keys)}.`,
  };
}

export function checkVaultPreflight(ran: boolean, duplicateServices: number | null): GuardResult {
  if (!ran || duplicateServices === null) {
    return {
      id: "vault-migration-preflight",
      title: "Vault B duplicate preflight",
      status: "fail",
      evidence: `Preflight has not been run. Required before any copy: ${PREFLIGHT_SQL}`,
    };
  }
  if (duplicateServices > 0) {
    return {
      id: "vault-migration-preflight",
      title: "Vault B duplicate preflight",
      status: "fail",
      evidence: `${duplicateServices} service(s) have more than one username. Migration would drop credentials. Stop.`,
    };
  }
  return {
    id: "vault-migration-preflight",
    title: "Vault B duplicate preflight",
    status: "pass",
    evidence: "Preflight returned zero duplicate-username services.",
  };
}

export function checkKnowledge(k: { vaultLookup: string; vaultCrypto: string }): GuardResult[] {
  const lookup =
    k.vaultLookup === CANONICAL_VAULT_SQL
      ? {
          id: "local-vault-lookup",
          title: "Local vault lookup",
          status: "pass" as const,
          evidence: `Lookup is ${k.vaultLookup}. Vault A PK is service alone.`,
        }
      : {
          id: "local-vault-lookup",
          title: "Local vault lookup",
          status: "fail" as const,
          evidence: `Packet says ${k.vaultLookup}. That is the Vault B snippet. Vault A is ${CANONICAL_VAULT_SQL}.`,
        };
  const crypto =
    k.vaultCrypto === CANONICAL_CRYPTO
      ? {
          id: "local-vault-crypto",
          title: "Local vault crypto line",
          status: "pass" as const,
          evidence: k.vaultCrypto,
        }
      : {
          id: "local-vault-crypto",
          title: "Local vault crypto line",
          status: "fail" as const,
          evidence: `Packet says ${k.vaultCrypto}. Code is ${CANONICAL_CRYPTO}.`,
        };
  return [lookup, crypto];
}

export function checkCatalog(entries: { id: string; handler: boolean }[]): GuardResult {
  if (entries.length === 0) {
    return {
      id: "catalog-handler",
      title: "Catalog entries have handlers",
      status: "unprobed",
      evidence: "Tool catalog was not stood this session. Not scored as green.",
    };
  }
  const missing = entries.filter((e) => !e.handler).map((e) => e.id);
  if (missing.length) {
    return {
      id: "catalog-handler",
      title: "Catalog entries have handlers",
      status: "fail",
      evidence: `No handler for ${quote(missing)}.`,
    };
  }
  return {
    id: "catalog-handler",
    title: "Catalog entries have handlers",
    status: "pass",
    evidence: `${entries.length} catalog entries have handlers.`,
  };
}

export function checkDeps(declared: string[], installed: string[]): GuardResult {
  if (declared.length === 0) {
    return {
      id: "declared-deps",
      title: "Declared dependencies are installed",
      status: "unprobed",
      evidence: "Dependency manifest was not stood. Not scored as green.",
    };
  }
  const missing = declared.filter((dep) => !installed.includes(dep));
  if (missing.length) {
    return {
      id: "declared-deps",
      title: "Declared dependencies are installed",
      status: "fail",
      evidence: `Declared but not installed: ${quote(missing)}.`,
    };
  }
  return {
    id: "declared-deps",
    title: "Declared dependencies are installed",
    status: "pass",
    evidence: `${declared.length} declared dependencies are installed.`,
  };
}

export function checkVolume(target: string, pct: number): GuardResult {
  const onTurbo = target.startsWith("/mnt/echo_turbo");
  if (!onTurbo || pct > 92) {
    return {
      id: "artifact-volume",
      title: "Artifacts stay on echo_turbo under 92%",
      status: "fail",
      evidence: `Refused write to ${target} at ${pct}%. Artifacts belong on /mnt/echo_turbo and stop above 92%.`,
    };
  }
  return {
    id: "artifact-volume",
    title: "Artifacts stay on echo_turbo under 92%",
    status: "pass",
    evidence: `${target} at ${pct}%.`,
  };
}

export function checkJail(root: string, paths: string[]): GuardResult {
  const escaped = paths.filter((p) => !isInside(p, root));
  if (escaped.length) {
    return {
      id: "path-jail",
      title: "Cloud walk stays inside /home/forge",
      status: "fail",
      evidence: `Escapes ${root}: ${quote(escaped)}.`,
    };
  }
  return {
    id: "path-jail",
    title: "Cloud walk stays inside /home/forge",
    status: "pass",
    evidence: `${paths.length} path(s) inside ${root}.`,
  };
}

export function isInside(path: string, root: string): boolean {
  const norm = normalize(path);
  const base = normalize(root);
  return norm === base || norm.startsWith(`${base}/`);
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function classifyPath(path: string, origin: "cloud" | "hammer"): string {
  const lowered = path.replaceAll("\\", "/").toLowerCase();
  if (lowered.includes("downloads") || /^[a-z]:\//i.test(path.replaceAll("\\", "/"))) {
    return "hammer-disk";
  }
  if (lowered.startsWith("/home/anvil") || lowered.startsWith("/home/crucible")) return "unreachable-host";
  if (origin === "cloud" && !isInside(path, "/home/forge")) return "jail-escape";
  return "in-jail";
}

export function classifyConnector(connected: boolean, authError: string | null): string {
  if (connected && authError && /auth/i.test(authError)) return "stale-token";
  if (!connected) return "absent";
  return "ok";
}

export function checkConnectorClass(
  connected: boolean,
  authError: string | null,
  classified: string,
): GuardResult {
  const expected = classifyConnector(connected, authError);
  if (classified !== expected) {
    return {
      id: "connector-class",
      title: "Connector failures keep their class",
      status: "fail",
      evidence: `Expected ${expected}, got ${classified}.`,
    };
  }
  return {
    id: "connector-class",
    title: "Connector failures keep their class",
    status: "pass",
    evidence: `Classified ${expected}.`,
  };
}

export function checkLiveAuth(staleCount: number): GuardResult {
  if (staleCount > 0) {
    return {
      id: "live-connector-auth",
      title: "Search connectors authenticate",
      status: "fail",
      evidence: `${staleCount} search connectors are connected and returned Authentication required. Disconnect, then Connect.`,
    };
  }
  return {
    id: "live-connector-auth",
    title: "Search connectors authenticate",
    status: "pass",
    evidence: "No stale search tokens in this probe.",
  };
}

const SECRET_VALUE = /(?:AKIA[0-9A-Z]{16}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|SECRET_VALUE_[A-Z0-9_]+)/;

export function containsSecretValue(text: string): boolean {
  return SECRET_VALUE.test(text);
}

export function checkLedgerClean(text: string): GuardResult {
  if (containsSecretValue(text)) {
    return {
      id: "no-secret-in-ledger",
      title: "Ledger stores no secret values",
      status: "fail",
      evidence: "A secret-shaped value was refused. Counts, names, and hashes only.",
    };
  }
  return {
    id: "no-secret-in-ledger",
    title: "Ledger stores no secret values",
    status: "pass",
    evidence: "No secret-shaped value in the record.",
  };
}

export function evaluate(state: KernelState): GuardResult[] {
  return [
    checkSchemaGap({ declared: 33, migrated: 20, namedUnmigrated: ["Property"] }),
    {
      id: "sql-migration-conformance",
      title: "SQL matches migrations",
      status: "unprobed",
      evidence:
        "MailBridge SQL was not re-read this session. The guard is proven on a fixture. Fleet gap is the 33 vs 20 count, Property named.",
    },
    checkCatalog([]),
    checkDeps([], []),
    checkTokens(["echo.engine.:id"], 13731),
    checkHeaders({ caseSensitive: true, sdkTokenCount: 19, sdkTokenFoldCount: 18 }),
    checkProcess({ id: "echo.logs.tail", timeoutMs: null, terminates: false }),
    checkImport("vault_credential_manager", false, "routers/vault.py:69"),
    checkOauthKeys(["username"]),
    checkVaultPreflight(false, null),
    ...checkKnowledge(state.knowledge),
    checkLiveAuth(4),
    {
      id: "artifact-volume",
      title: "Artifacts stay on echo_turbo under 92%",
      status: "unprobed",
      evidence:
        "No artifact write this session. echo_turbo last known 4% of 150 GB, not re-probed. The guard refuses a non-turbo path and any volume above 92%.",
    },
    checkJail("/home/forge", ["/home/forge/echo-worker-server/data/vault.db"]),
    checkLedgerClean(state.ledger.map((r) => JSON.stringify(r)).join("\n")),
  ];
}

function proof(id: string, cases: TamperProof["cases"]): TamperProof {
  return {
    id,
    discriminated: cases.every((c) => c.failed && c.restored),
    cases,
  };
}

export function proveAll(): TamperProof[] {
  const sqlClean = checkSqlFixture(WIDGET);
  const sqlNoMigration = checkSqlFixture({ ...WIDGET, tables: [] });
  const sqlDropColumn = checkSqlFixture({
    tables: [{ name: "Widget", columns: ["id"], uniques: [["id"]] }],
    queries: WIDGET.queries,
  });
  const sqlNoUnique = checkSqlFixture({
    tables: [{ name: "Widget", columns: ["id", "name"], uniques: [] }],
    queries: WIDGET.queries,
  });
  const sqlRestored = checkSqlFixture(WIDGET);

  const gapClean = checkSchemaGap({ declared: 2, migrated: 2, namedUnmigrated: [] });
  const gapTamper = checkSchemaGap({ declared: 3, migrated: 2, namedUnmigrated: ["Property"] });
  const gapRestored = checkSchemaGap({ declared: 2, migrated: 2, namedUnmigrated: [] });

  const headerClean = checkHeaders({ caseSensitive: false, sdkTokenCount: 19, sdkTokenFoldCount: 18 });
  const headerTamper = checkHeaders({ caseSensitive: true, sdkTokenCount: 19, sdkTokenFoldCount: 18 });
  const headerRestored = checkHeaders({ caseSensitive: false, sdkTokenCount: 19, sdkTokenFoldCount: 18 });

  const tokenClean = checkTokens(["echo.engine.fleet"], 0);
  const tokenTamper = checkTokens(["echo.engine.:id"], 3);
  const tokenRestored = checkTokens(["echo.engine.fleet"], 0);

  const procClean = checkProcess({ id: "echo.logs.tail", timeoutMs: 2000, terminates: true });
  const procTamper = checkProcess({ id: "echo.logs.tail", timeoutMs: null, terminates: false });
  const procRestored = checkProcess({ id: "echo.logs.tail", timeoutMs: 2000, terminates: true });

  const importClean = checkImport("vault_credential_manager", true, "fixture");
  const importTamper = checkImport("vault_credential_manager", false, "routers/vault.py:69");
  const importRestored = checkImport("vault_credential_manager", true, "fixture");

  const oauthClean = checkOauthKeys(["service"]);
  const oauthTamper = checkOauthKeys(["username"]);
  const oauthRestored = checkOauthKeys(["service"]);

  const preClean = checkVaultPreflight(true, 0);
  const preTamper = checkVaultPreflight(true, 2);
  const preMissing = checkVaultPreflight(false, null);
  const preRestored = checkVaultPreflight(true, 0);

  const knowClean = checkKnowledge({ vaultLookup: CANONICAL_VAULT_SQL, vaultCrypto: CANONICAL_CRYPTO });
  const knowTamper = checkKnowledge({ vaultLookup: STALE_VAULT_SQL, vaultCrypto: STALE_CRYPTO_DOC });
  const knowRestored = checkKnowledge({ vaultLookup: CANONICAL_VAULT_SQL, vaultCrypto: CANONICAL_CRYPTO });

  const catClean = checkCatalog([{ id: "echo.logs.tail", handler: true }]);
  const catTamper = checkCatalog([{ id: "echo.engine.:id", handler: false }]);
  const catRestored = checkCatalog([{ id: "echo.logs.tail", handler: true }]);

  const depClean = checkDeps(["loguru"], ["loguru"]);
  const depTamper = checkDeps(["loguru"], []);
  const depRestored = checkDeps(["loguru"], ["loguru"]);

  const volClean = checkVolume("/mnt/echo_turbo/prometheus", 4);
  const volPath = checkVolume("/home/forge/tmp", 4);
  const volFull = checkVolume("/mnt/echo_turbo/prometheus", 93);
  const volRestored = checkVolume("/mnt/echo_turbo/prometheus", 4);

  const jailClean = checkJail("/home/forge", ["/home/forge/echo-worker-server/data/vault.db"]);
  const jailTamper = checkJail("/home/forge", ["/etc/passwd"]);
  const jailDot = checkJail("/home/forge", ["/home/forge/../../etc/passwd"]);
  const jailRestored = checkJail("/home/forge", ["/home/forge/echo-worker-server/data/vault.db"]);

  const ledgerClean = checkLedgerClean("service=vault count=2");
  const ledgerTamper = checkLedgerClean("SECRET_VALUE_SHOULD_NOT_PERSIST");
  const ledgerRestored = checkLedgerClean("service=vault count=2");

  const connClean = checkConnectorClass(true, null, "ok");
  const connTamper = checkConnectorClass(true, "Authentication required", "absent");
  const connRestored = checkConnectorClass(true, null, "ok");

  return [
    proof("sql-migration-conformance", [
      {
        name: "remove migration",
        failed: sqlNoMigration.status === "fail" && sqlClean.status === "pass",
        restored: sqlRestored.status === "pass",
        evidence: sqlNoMigration.evidence,
      },
      {
        name: "drop column",
        failed: sqlDropColumn.status === "fail" && sqlDropColumn.evidence.includes("name"),
        restored: sqlRestored.status === "pass",
        evidence: sqlDropColumn.evidence,
      },
      {
        name: "remove unique",
        failed: sqlNoUnique.status === "fail" && /conflict/i.test(sqlNoUnique.evidence),
        restored: sqlRestored.status === "pass",
        evidence: sqlNoUnique.evidence,
      },
    ]),
    proof("schema-count-gap", [
      {
        name: "3 models vs 2 tables",
        failed: gapTamper.status === "fail" && gapClean.status === "pass",
        restored: gapRestored.status === "pass",
        evidence: gapTamper.evidence,
      },
    ]),
    proof("secret-header-case", [
      {
        name: "case-sensitive scanner",
        failed: headerTamper.status === "fail" && headerClean.status === "pass",
        restored: headerRestored.status === "pass",
        evidence: headerTamper.evidence,
      },
    ]),
    proof("capability-tokens", [
      {
        name: "unsubstituted token",
        failed: tokenTamper.status === "fail" && tokenClean.status === "pass",
        restored: tokenRestored.status === "pass",
        evidence: tokenTamper.evidence,
      },
    ]),
    proof("bounded-await", [
      {
        name: "remove timeout",
        failed: procTamper.status === "fail" && procClean.status === "pass",
        restored: procRestored.status === "pass",
        evidence: procTamper.evidence,
      },
    ]),
    proof("import-resolved", [
      {
        name: "absent module",
        failed: importTamper.status === "fail" && importClean.status === "pass",
        restored: importRestored.status === "pass",
        evidence: importTamper.evidence,
      },
    ]),
    proof("oauth-match-key", [
      {
        name: "username only",
        failed: oauthTamper.status === "fail" && oauthClean.status === "pass",
        restored: oauthRestored.status === "pass",
        evidence: oauthTamper.evidence,
      },
    ]),
    proof("vault-migration-preflight", [
      {
        name: "two usernames",
        failed: preTamper.status === "fail" && preClean.status === "pass",
        restored: preRestored.status === "pass",
        evidence: preTamper.evidence,
      },
      {
        name: "query not run",
        failed: preMissing.status === "fail",
        restored: preRestored.status === "pass",
        evidence: preMissing.evidence,
      },
    ]),
    proof("local-knowledge", [
      {
        name: "stale lookup and AES doc",
        failed: knowTamper.every((g) => g.status === "fail") && knowClean.every((g) => g.status === "pass"),
        restored: knowRestored.every((g) => g.status === "pass"),
        evidence: knowTamper.map((g) => g.evidence).join(" "),
      },
    ]),
    proof("catalog-handler", [
      {
        name: "catalog id without handler",
        failed: catTamper.status === "fail" && catClean.status === "pass",
        restored: catRestored.status === "pass",
        evidence: catTamper.evidence,
      },
    ]),
    proof("declared-deps", [
      {
        name: "missing install",
        failed: depTamper.status === "fail" && depClean.status === "pass",
        restored: depRestored.status === "pass",
        evidence: depTamper.evidence,
      },
    ]),
    proof("artifact-volume", [
      {
        name: "write outside echo_turbo",
        failed: volPath.status === "fail" && volClean.status === "pass",
        restored: volRestored.status === "pass",
        evidence: volPath.evidence,
      },
      {
        name: "volume above 92%",
        failed: volFull.status === "fail",
        restored: volRestored.status === "pass",
        evidence: volFull.evidence,
      },
    ]),
    proof("path-jail", [
      {
        name: "/etc/passwd",
        failed: jailTamper.status === "fail" && jailClean.status === "pass",
        restored: jailRestored.status === "pass",
        evidence: jailTamper.evidence,
      },
      {
        name: "dot-dot escape",
        failed: jailDot.status === "fail",
        restored: jailRestored.status === "pass",
        evidence: jailDot.evidence,
      },
    ]),
    proof("no-secret-in-ledger", [
      {
        name: "secret-shaped value",
        failed: ledgerTamper.status === "fail" && ledgerClean.status === "pass",
        restored: ledgerRestored.status === "pass",
        evidence: ledgerTamper.evidence,
      },
    ]),
    proof("connector-class", [
      {
        name: "stale token labeled absent",
        failed: connTamper.status === "fail" && connClean.status === "pass",
        restored: connRestored.status === "pass",
        evidence: connTamper.evidence,
      },
    ]),
  ];
}

export function fleetFailCount(state: KernelState): number {
  return evaluate(state).filter((g) => g.status === "fail").length;
}
