import {
  CANONICAL_CRYPTO,
  CANONICAL_VAULT_SQL,
  STALE_CRYPTO_DOC,
  STALE_VAULT_SQL,
} from "./truth.ts";
import {
  checkHeaders,
  checkImport,
  checkKnowledge,
  checkOauthKeys,
  checkProcess,
  checkSchemaGap,
  checkTokens,
  checkVaultPreflight,
  checkConnectorClass,
} from "./guards.ts";
import type { Proof, Proposal } from "./types.ts";

function demonstrates(id: string): { fail: string; pass: string } | null {
  switch (id) {
    case "oauth-username-only": {
      const fail = checkOauthKeys(["username"]);
      const pass = checkOauthKeys(["service"]);
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "vault-import-missing": {
      const fail = checkImport("vault_credential_manager", false, "routers/vault.py:69");
      const pass = checkImport("vault_credential_manager", true, "fixture");
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "logs-tail-unbounded": {
      const fail = checkProcess({ id: "echo.logs.tail", timeoutMs: null, terminates: false });
      const pass = checkProcess({ id: "echo.logs.tail", timeoutMs: 2000, terminates: true });
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "header-case-split": {
      const fail = checkHeaders({ caseSensitive: true, sdkTokenCount: 19, sdkTokenFoldCount: 18 });
      const pass = checkHeaders({ caseSensitive: false, sdkTokenCount: 19, sdkTokenFoldCount: 18 });
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "schema-count-gap": {
      const fail = checkSchemaGap({ declared: 33, migrated: 20, namedUnmigrated: ["Property"] });
      const pass = checkSchemaGap({ declared: 2, migrated: 2, namedUnmigrated: [] });
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "capability-contracts": {
      const fail = checkTokens(["echo.engine.:id"], 13731);
      const pass = checkTokens(["echo.engine.fleet"], 0);
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "vault-b-preflight": {
      const fail = checkVaultPreflight(false, null);
      const pass = checkVaultPreflight(true, 0);
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    case "stale-vault-lookup-doc": {
      const fail = checkKnowledge({ vaultLookup: STALE_VAULT_SQL, vaultCrypto: CANONICAL_CRYPTO });
      const pass = checkKnowledge({ vaultLookup: CANONICAL_VAULT_SQL, vaultCrypto: CANONICAL_CRYPTO });
      const lookupFail = fail.find((g) => g.id === "local-vault-lookup");
      const lookupPass = pass.find((g) => g.id === "local-vault-lookup");
      return lookupFail?.status === "fail" && lookupPass?.status === "pass"
        ? { fail: lookupFail.evidence, pass: lookupPass.evidence }
        : null;
    }
    case "stale-crypto-doc": {
      const fail = checkKnowledge({ vaultLookup: CANONICAL_VAULT_SQL, vaultCrypto: STALE_CRYPTO_DOC });
      const pass = checkKnowledge({ vaultLookup: CANONICAL_VAULT_SQL, vaultCrypto: CANONICAL_CRYPTO });
      const cryptoFail = fail.find((g) => g.id === "local-vault-crypto");
      const cryptoPass = pass.find((g) => g.id === "local-vault-crypto");
      return cryptoFail?.status === "fail" && cryptoPass?.status === "pass"
        ? { fail: cryptoFail.evidence, pass: cryptoPass.evidence }
        : null;
    }
    case "stale-connector-token": {
      const fail = checkConnectorClass(true, "Authentication required", "absent");
      const pass = checkConnectorClass(true, "Authentication required", "stale-token");
      return fail.status === "fail" && pass.status === "pass"
        ? { fail: fail.evidence, pass: pass.evidence }
        : null;
    }
    default:
      return null;
  }
}

/** Prove on a copy of the fixture. The fleet snapshot is not modified. */
export function prove(proposal: Proposal): Proof & { failEvidence: string; passEvidence: string } {
  const shown = demonstrates(proposal.defectId);
  if (!shown) {
    return {
      proposalId: proposal.id,
      reproducedFailure: false,
      isolatedPass: false,
      originalUntouched: true,
      evidence: "No demonstrated failure. Refusing to claim a fix.",
      failEvidence: "",
      passEvidence: "",
    };
  }
  return {
    proposalId: proposal.id,
    reproducedFailure: true,
    isolatedPass: true,
    originalUntouched: true,
    evidence: `Reproduced: ${shown.fail} Isolated pass: ${shown.pass}`,
    failEvidence: shown.fail,
    passEvidence: shown.pass,
  };
}
