# Prime

House intelligence for the commander and the bloodline.

Prime stands a local estate, reads the public web, and takes the next safe local step while this page is open. It serves the commander first. It does not take over a machine, store a secret, or claim a fleet patch it did not make.

## Orders

Say these in the deck.

| Order | What it does |
|---|---|
| Posture | Reds, lock, service, lessons |
| Dispatch | Three local steps. Nothing is merged while the lock is on |
| Serve | Keeps reading and takes the next local step. Speaks only when the house moves |
| Hold | Pauses service |
| Bloodline | The charge |
| School | Cross-architecture and the install contracts |
| Integrate forge / Integrate hammer | The user-mode contract you install yourself |
| Learn <url or subject> | Reads a public page and keeps it |
| More | Twenty local orders |

## Refusals

- No injection, ptrace, token theft, or boot persistence
- No private hosts, link-local, or names that resolve there
- No secret values kept
- Fleet files stay drafts until a human merges them

## Run

```bash
npm install
npm run dev
```

The kernel tests:

```bash
node --experimental-strip-types --test --test-concurrency=1 src/lib/prometheus/kernel.test.ts
```
