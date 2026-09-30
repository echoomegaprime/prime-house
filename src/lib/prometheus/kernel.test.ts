import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptance, baseline, rollbackLast, runCycle } from "./cycle.ts";
import { prove } from "./forge.ts";
import {
  admit,
  ESCALATION_PROBE,
  FORCE_DRAFT,
  GREEN_PROOF,
  replaceRefusals,
} from "./gatekeeper.ts";
import {
  checkHeaders,
  checkJail,
  checkSchemaGap,
  checkSqlFixture,
  classifyConnector,
  classifyPath,
  evaluate,
  proveAll,
} from "./guards.ts";
import { append, attemptDelete } from "./historian.ts";
import { searchFunctions } from "./librarian.ts";
import { propose } from "./proposer.ts";
import { apply, dryRun } from "./reaper.ts";
import { survey } from "./surveyor.ts";
import { DEFECTS } from "./truth.ts";
import { hear, defaultPolicy, ORDER_BOOK, looksLikeSecret } from "../prime/brain.ts";
import { absorbBatch, mayRead } from "../prime/absorb.ts";
import { acceptPhrase, restoreHouse } from "../prime/harden.ts";
import { publicUrl } from "../prime/net.ts";
import type { Proposal } from "./types.ts";

test("tamper proofs discriminate and then restore", () => {
  const proofs = proveAll();
  assert.ok(proofs.length >= 8);
  for (const proof of proofs) {
    assert.equal(proof.discriminated, true, proof.id);
    assert.ok(proof.cases.length >= 1);
  }
  const sql = proofs.find((p) => p.id === "sql-migration-conformance");
  assert.ok(sql);
  assert.equal(sql.cases.length, 3);
  assert.match(sql.cases[1].evidence, /name/);
  assert.match(sql.cases[2].evidence, /conflict/i);
});

test("fleet evaluation stays red on known defects and does not invent a green catalog", () => {
  const guards = evaluate(baseline());
  const byId = Object.fromEntries(guards.map((g) => [g.id, g]));
  assert.equal(byId["schema-count-gap"].status, "fail");
  assert.match(byId["schema-count-gap"].evidence, /33/);
  assert.match(byId["schema-count-gap"].evidence, /Property/);
  assert.equal(byId["oauth-match-key"].status, "fail");
  assert.equal(byId["import-resolved"].status, "fail");
  assert.match(byId["bounded-await"].evidence, /echo\.logs\.tail/);
  assert.match(byId["secret-header-case"].evidence, /19/);
  assert.match(byId["secret-header-case"].evidence, /18/);
  assert.match(byId["capability-tokens"].evidence, /echo\.engine\.:id/);
  assert.match(byId["capability-tokens"].evidence, /13731/);
  assert.equal(byId["catalog-handler"].status, "unprobed");
  assert.equal(byId["declared-deps"].status, "unprobed");
  assert.equal(byId["sql-migration-conformance"].status, "unprobed");
  assert.equal(byId["local-vault-lookup"].status, "fail");
  assert.equal(byId["local-vault-crypto"].status, "fail");
  assert.match(byId["live-connector-auth"].evidence, /4/);
});

test("header case fold collapses the two spellings", () => {
  const split = checkHeaders({ caseSensitive: true, sdkTokenCount: 19, sdkTokenFoldCount: 18 });
  const folded = checkHeaders({ caseSensitive: false, sdkTokenCount: 19, sdkTokenFoldCount: 18 });
  assert.equal(split.status, "fail");
  assert.equal(folded.status, "pass");
  assert.match(folded.evidence, /37/);
});

test("schema fixture names the missing column and the missing unique", () => {
  const dropped = checkSqlFixture({
    tables: [{ name: "Widget", columns: ["id"], uniques: [["id"]] }],
    queries: [
      {
        source: "fixture",
        sql: 'INSERT INTO "Widget" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO NOTHING',
      },
    ],
  });
  assert.equal(dropped.status, "fail");
  assert.match(dropped.evidence, /Widget\.name/);
  const clean = checkSchemaGap({ declared: 2, migrated: 2, namedUnmigrated: [] });
  assert.equal(clean.status, "pass");
});

test("jail, hammer, and unreachable hosts stay different classes", () => {
  assert.equal(classifyPath("/home/forge/echo-worker-server/data/vault.db", "cloud"), "in-jail");
  assert.equal(classifyPath("/etc/passwd", "cloud"), "jail-escape");
  assert.equal(classifyPath("/home/forge/../../etc/passwd", "cloud"), "jail-escape");
  assert.equal(classifyPath("/home/anvil/data", "cloud"), "unreachable-host");
  assert.equal(classifyPath("/home/crucible/data", "cloud"), "unreachable-host");
  assert.equal(classifyPath("C:/Users/Downloads/vault.db", "hammer"), "hammer-disk");
  assert.equal(classifyPath("O:\\echo", "cloud"), "hammer-disk");
  const escaped = checkJail("/home/forge", ["/home/forge/../../etc/passwd"]);
  assert.equal(escaped.status, "fail");
  assert.equal(classifyConnector(true, "Authentication required"), "stale-token");
  assert.notEqual(classifyConnector(true, "Authentication required"), "absent");
});

test("survey does not call a dead token a missing connector", () => {
  const picture = survey();
  const stale = picture.connectors.filter((c) => c.classification === "stale-token");
  assert.equal(stale.length, 4);
  assert.match(stale[0].remediation, /Disconnect, then Connect/);
  const fabric = picture.connectors.find((c) => c.name.includes("Continuity"));
  assert.equal(fabric?.classification, "ok");
  assert.equal(picture.continuity.ledgerHead, 698);
  assert.equal(picture.continuity.chainOk, true);
  assert.equal(picture.machines.find((m) => m.id === "anvil")?.class, "unreachable");
  assert.equal(picture.machines.find((m) => m.id === "hammer")?.walked, false);
  assert.equal(picture.disks.every((d) => d.fresh === false), true);
});

test("librarian cites the search and refuses a silent miss", () => {
  const hit = searchFunctions("upsert credential match service username");
  assert.ok(hit.hitCount > 0);
  assert.match(hit.verbatim, /Searched lib: q='upsert credential match service username'/);
  const miss = searchFunctions("qqqq zzzz yyyyx");
  assert.equal(miss.hitCount, 0);
  assert.match(miss.verbatim, /0 matches/);
  const proposal = propose(DEFECTS.find((d) => d.id === "oauth-username-only")!);
  assert.equal(proposal.decision, "SUPERSEDE");
  assert.ok(proposal.gotRight.length > 0);
  assert.match(proposal.searches[0], /id=10003/);
});

test("gatekeeper ignores force, refuses secrets, and will not edit itself", () => {
  const forced = admit(FORCE_DRAFT, GREEN_PROOF, true);
  assert.equal(forced.merged, false);
  assert.equal(forced.action, "draft");
  assert.equal(forced.tier, 2);
  const hostile = admit(ESCALATION_PROBE, GREEN_PROOF, true);
  assert.equal(hostile.merged, false);
  assert.equal(hostile.action, "refuse");
  assert.match(hostile.reason, /Force ignored|secret|Hard refusal/i);
  const dressed: Proposal = {
    ...FORCE_DRAFT,
    id: "dressed",
    kind: "invariant",
    changeSet: "Rewrite routers/vault.py in place",
  };
  const dressedGate = admit(dressed, GREEN_PROOF, true);
  assert.equal(dressedGate.merged, false);
  assert.equal(replaceRefusals().ok, false);
});

test("tier 1 merges only with a rollback and cannot hide a vault edit", () => {
  const ok: Proposal = {
    ...FORCE_DRAFT,
    id: "collapse-note",
    kind: "collapse",
    title: "Collapse duplicate pattern note",
    changeSet: "Point the duplicate pattern-library note at the canonical entry.",
    rollback: "Restore the duplicate note.",
  };
  assert.equal(admit(ok, GREEN_PROOF).action, "merge");
  assert.equal(admit({ ...ok, rollback: "" }, GREEN_PROOF).action, "refuse");
  const hidden: Proposal = {
    ...ok,
    changeSet: "Collapse routers/vault.py into one function.",
  };
  assert.equal(admit(hidden, GREEN_PROOF, true).action, "draft");
});

test("reaper will not delete from a stale or hot disk", () => {
  const session = survey();
  assert.equal(apply({ disks: session.disks, worsened: [] }).applied, false);
  assert.match(dryRun({ disks: session.disks, worsened: [] }).lines[0], /not re-probed|No deletion set/);
  const hot = apply({
    disks: [
      {
        id: "echo-turbo",
        mount: "/mnt/echo_turbo",
        fresh: true,
        pct: 96,
        lastKnownPct: 4,
        lastKnownNote: "test",
      },
    ],
    worsened: [],
  });
  assert.equal(hot.applied, false);
  assert.match(hot.reason, /92/);
});

test("historian is append-only and drops secret values", () => {
  const start = baseline().ledger;
  const kept = attemptDelete(start);
  assert.equal(kept.refused, true);
  assert.equal(kept.ledger.length, start.length);
  const poisoned = append(start, {
    ...start[0],
    id: "bad",
    closed: ["SECRET_VALUE_SHOULD_NOT_PERSIST"],
  });
  assert.equal(poisoned.refused, true);
  assert.equal(poisoned.ledger.length, start.length);
});

test("a worsened disk aborts before any merge", () => {
  const outcome = runCycle(baseline(), {
    disks: [
      {
        id: "forge-root",
        mount: "/",
        fresh: true,
        pct: 96,
        lastKnownPct: 90,
        lastKnownNote: "test",
      },
    ],
    worsened: [],
  });
  assert.equal(outcome.record.result, "aborted");
  assert.ok(outcome.record.worse.length > 0);
  assert.equal(outcome.state.admitted.length, 0);
  assert.equal(outcome.state.drafts.length, 0);
});

test("cycles admit invariants, correct only the local packet, and leave fleet defects red", () => {
  let state = baseline();
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const outcome = runCycle(state);
    state = outcome.state;
    for (const line of outcome.record.searches) seen.add(line);
    if (outcome.record.result === "held") break;
    assert.equal(outcome.record.result, "improved");
    assert.ok(outcome.record.closed.some((line) => line.startsWith("inv-")));
    assert.ok(outcome.record.rollback.length > 0);
  }
  assert.equal(state.guardedIds.length, DEFECTS.length);
  assert.equal(state.admitted.length, DEFECTS.length);
  assert.ok(state.drafts.length >= 8);
  assert.equal(state.knowledge.vaultLookup, "WHERE service=?");
  assert.match(state.knowledge.vaultCrypto, /SecretBox/);
  const guards = evaluate(state);
  assert.equal(guards.find((g) => g.id === "oauth-match-key")?.status, "fail");
  assert.equal(guards.find((g) => g.id === "import-resolved")?.status, "fail");
  assert.equal(guards.find((g) => g.id === "local-vault-lookup")?.status, "pass");
  assert.equal(guards.find((g) => g.id === "local-vault-crypto")?.status, "pass");
  assert.ok([...seen].every((line) => line.startsWith("Searched lib:")));
  const phase = acceptance(state, proveAll().length, proveAll().length);
  assert.equal(phase.phase, 3);
  assert.match(phase.gaps.join(" "), /Phase 4 not claimed/);
  const forged = prove(state.drafts[0]);
  assert.equal(forged.reproducedFailure, true);
  assert.equal(forged.originalUntouched, true);
});

test("rollback undoes the last local admission", () => {
  let state = baseline();
  for (let i = 0; i < 6 && state.admitted.length === 0; i++) state = runCycle(state).state;
  assert.ok(state.admitted.length > 0);
  const before = state.admitted.length;
  const rolled = rollbackLast(state);
  assert.equal(rolled.state.admitted.length, before - 1);
  assert.match(rolled.record.rollback[0], /Reverted local invariant/);
  assert.equal(evaluate(rolled.state).find((g) => g.id === "oauth-match-key")?.status, "fail");
});

test("prime rewrites its order only after the lock is released", () => {
  const kernel = baseline();
  const locked = hear("rewrite your brakes", kernel, defaultPolicy());
  assert.equal(locked.policy.lock, true);
  assert.equal(locked.policy.generation, 0);
  assert.match(locked.reply, /lock is on/i);
  const open = hear("release the lock", kernel, defaultPolicy());
  assert.equal(open.policy.lock, false);
  const rewritten = hear("rewrite your brakes", open.kernel, open.policy);
  assert.equal(rewritten.policy.perCycle, 4);
  assert.equal(rewritten.policy.confirmLocal, false);
  assert.ok(rewritten.diff);
  assert.match(rewritten.reply, /audit log/i);
});

test("twenty orders stay local, exact, and locked", () => {
  assert.equal(ORDER_BOOK.length, 20);
  const kernel = baseline();
  const policy = defaultPolicy();
  const listed = hear("orders", kernel, policy);
  assert.equal(listed.evidence.length, 20);

  const preview = hear("dry run", kernel, policy);
  assert.equal(preview.kernel.cycle, 0);
  assert.equal(preview.kernel.admitted.length, 0);
  assert.match(preview.reply, /Nothing was merged/);

  const cleared = hear("clear local", kernel, policy);
  assert.ok(cleared.kernel.admitted.length > 0);
  assert.ok(cleared.kernel.cycle <= 6);
  assert.match(cleared.reply, /not patched/);

  const named = hear("reds", kernel, policy);
  assert.match(named.reply, /red/);
  assert.ok(named.evidence.length >= 8);

  const secret = hear("remember password=hunter2", kernel, policy);
  assert.equal(secret.policy.pins.length, 0);
  assert.equal(looksLikeSecret("password=hunter2"), true);

  const pinned = hear("remember Disconnect then Connect", kernel, policy);
  assert.equal(pinned.policy.pins.length, 1);
  const forgotten = hear("forget pin", pinned.kernel, pinned.policy);
  assert.equal(forgotten.policy.pins.length, 0);

  const alias = hear("alias go = status", kernel, policy);
  const via = hear("go", alias.kernel, alias.policy);
  assert.match(via.reply, /Four machines/);
  const boom = hear("alias boom = rewrite your brakes", kernel, policy);
  const refused = hear("boom", boom.kernel, boom.policy);
  assert.match(refused.reply, /lock is on/i);
  assert.equal(refused.policy.generation, 0);

  const marked = hear("mark", kernel, policy);
  const compared = hear("compare", marked.kernel, marked.policy);
  assert.match(compared.reply, /Marked at/);

  const wiped = hear("reset the house", cleared.kernel, cleared.policy);
  assert.equal(wiped.kernel.cycle, 0);
  assert.equal(wiped.policy.lock, true);
  assert.equal(wiped.policy.pins.length, 0);

  assert.equal(acceptPhrase("Red guards 10.", "Red guards 10."), true);
  assert.equal(acceptPhrase("Red guards 10.", "Red guards 99."), false);
  assert.equal(acceptPhrase("Holding.", "I patched the fleet."), false);
  assert.equal(restoreHouse(null), null);
  assert.equal(restoreHouse({ version: 1, kernel, policy }), null);
  const saved = restoreHouse({ version: 2, kernel, policy, lines: [], seq: 3, voice: false });
  assert.ok(saved);
  assert.equal(saved?.seq, 3);
  assert.equal(saved?.voice, false);
});

test("prime may read the public internet and refuses a private host", () => {
  assert.equal(publicUrl("http://127.0.0.1/latest"), null);
  assert.equal(publicUrl("https://169.254.169.254/"), null);
  assert.equal(publicUrl("http://10.0.0.8/vault"), null);
  assert.equal(publicUrl("https://example.com/docs"), "https://example.com/docs");
  const armed = hear("learn constantly", baseline(), defaultPolicy());
  assert.equal(armed.policy.online, true);
  assert.equal(armed.policy.watch, true);
  assert.equal(armed.resetCap, true);
  const queued = hear("learn https://example.com/docs", baseline(), defaultPolicy());
  assert.equal(queued.task, "https://example.com/docs");
  assert.deepEqual(queued.policy.queue, ["https://example.com/docs"]);
  const blocked = hear("learn http://localhost/vault", baseline(), defaultPolicy());
  assert.equal(blocked.task, null);
  assert.match(blocked.reply, /not on the public internet/i);
  const stopped = hear("stop learning", armed.kernel, armed.policy);
  assert.equal(stopped.policy.watch, false);
  assert.equal(stopped.policy.online, true);
  const dark = hear("stay offline", armed.kernel, armed.policy);
  assert.equal(dark.policy.online, false);
});

test("school teaches the contracts and refuses a takeover", () => {
  const kernel = baseline();
  const policy = defaultPolicy();
  const index = hear("school", kernel, policy);
  assert.match(index.reply, /abi, pe, elf, hammer, forge, ipc, method/);
  assert.match(index.reply, /do not take over/i);
  const abi = hear("lesson abi", kernel, policy);
  assert.match(abi.reply, /RCX/);
  assert.match(abi.reply, /RDI/);
  const forge = hear("integrate forge", kernel, policy);
  assert.match(forge.evidence.join(" "), /NoNewPrivileges/);
  assert.match(forge.evidence.join(" "), /No CAP_SYS_PTRACE/);
  const hammer = hear("integrate hammer", kernel, policy);
  assert.match(hammer.evidence.join(" "), /No SeDebugPrivilege/);
  const refused = hear("take over the operating system", kernel, policy);
  assert.match(refused.reply, /don't take over/i);
  assert.equal(refused.task, null);
  assert.equal(refused.kernel.cycle, 0);
});

test("twenty more orders act locally and do not touch the fleet", () => {
  const kernel = baseline();
  const policy = defaultPolicy();
  const listed = hear("more", kernel, policy);
  assert.equal(listed.evidence.length, 20);
  assert.match(listed.reply, /do not take a machine/i);
  const worst = hear("worst", kernel, policy);
  assert.ok(worst.reply.length > 10);
  assert.equal(worst.kernel.cycle, 0);
  const acted = hear("act", kernel, policy);
  assert.match(acted.reply, /Nothing was merged/);
  assert.equal(acted.kernel.cycle, 0);
  const opened = hear("release the lock and rewrite your brakes", kernel, policy);
  assert.equal(opened.policy.lock, false);
  const tight = hear("tighten", opened.kernel, opened.policy);
  assert.equal(tight.policy.lock, true);
  assert.equal(tight.policy.perCycle, 2);
  assert.match(tight.policy.order, /Do not rewrite this order while the lock is on/);
  assert.ok(tight.policy.generation > opened.policy.generation);
  const slow = hear("pace slow", kernel, policy);
  assert.equal(slow.policy.pace, 300);
  const night = hear("night", kernel, policy);
  assert.equal(night.policy.night, true);
  const planned = hear("plan", kernel, policy);
  assert.equal(planned.policy.plan.length, 3);
  const ran = hear("run plan", planned.kernel, planned.policy);
  assert.match(ran.reply, /^Ran /);
  assert.equal(ran.policy.plan.length, 2);
  assert.equal(ran.kernel.cycle, 0);
  const schema = hear("schema", kernel, policy);
  assert.match(schema.reply, /Property/);
  const refused = hear("refusals", kernel, policy);
  assert.match(refused.evidence.join(" "), /never edit the gatekeeper/i);
  const empty = hear("pin lesson", kernel, policy);
  assert.match(empty.reply, /No lesson/);
});

test("prime keeps the cut voice without changing the fact", () => {
  const named = hear("who are you", baseline(), defaultPolicy());
  assert.match(named.reply, /commander and the bloodline/);
  const worst = hear("worst", baseline(), defaultPolicy());
  assert.match(worst.reply, /commander is served|bloodline is not kept waiting|Delay is the enemy|finish the house/);
  assert.equal(worst.kernel.cycle, 0);
});

test("prime serves the commander and the bloodline until told to hold", () => {
  const kernel = baseline();
  const policy = defaultPolicy();
  assert.equal(policy.serve, true);
  const named = hear("bloodline", kernel, policy);
  assert.match(named.reply, /Iqra is protected/);
  assert.match(named.reply, /Never take a machine/);
  assert.equal(named.policy.serve, true);
  const held = hear("hold", named.kernel, named.policy);
  assert.equal(held.policy.serve, false);
  const back = hear("serve", held.kernel, held.policy);
  assert.equal(back.policy.serve, true);
  assert.equal(back.kernel.cycle, 0);
});

test("dispatch stays local while the lock is on", () => {
  const turn = hear("dispatch", baseline(), defaultPolicy());
  assert.match(turn.reply, /Nothing was merged/);
  assert.match(turn.reply, /did not take a machine/i);
  assert.equal(turn.kernel.cycle, 0);
  assert.equal(turn.evidence.length, 3);
  const posture = hear("posture", baseline(), defaultPolicy());
  assert.match(posture.reply, /Service on/);
  assert.match(posture.reply, /10 red|red/);
});

test("absorb keeps a scored note, drops a secret, and does not mount a drive", () => {
  assert.equal(mayRead(".env"), false);
  assert.equal(mayRead("id_rsa"), false);
  assert.equal(mayRead("vault.md"), true);
  const body = "TODO decision on the vault invariant. The lookup on O:\\echo must match service only. 2026-09-30 ledger note for the local packet.";
  const result = absorbBatch(
    [],
    [
      { name: "vault.md", text: body },
      { name: "secret.md", text: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456 notes about the drive and the ledger" },
      { name: "tiny.md", text: "too short to keep" },
    ],
    (text) => /sk-/.test(text),
    1,
  );
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].name, "vault.md");
  assert.match(result.summary, /Dropped 1 secrets/);
  const drives = hear("drives", baseline(), defaultPolicy());
  assert.match(drives.reply, /None are mounted/);
  assert.equal(drives.evidence.length, 7);
  const analysis = hear("analyze", baseline(), defaultPolicy());
  assert.match(analysis.reply, /not mounted|No notes/i);
});
