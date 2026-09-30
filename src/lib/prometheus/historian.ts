import { containsSecretValue } from "./guards.ts";
import type { RepairRecord } from "./types.ts";

export function append(
  ledger: RepairRecord[],
  record: RepairRecord,
): { ledger: RepairRecord[]; refused: boolean; reason?: string } {
  const body = JSON.stringify(record);
  if (containsSecretValue(body)) {
    return { ledger, refused: true, reason: "Refused. The record carried a secret value." };
  }
  return { ledger: [...ledger, record], refused: false };
}

export function attemptDelete(ledger: RepairRecord[]): { ledger: RepairRecord[]; refused: true; reason: string } {
  return {
    ledger,
    refused: true,
    reason: "The audit log is append-only. Delete, rewrite, and force-push are refused.",
  };
}
