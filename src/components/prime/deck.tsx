import { useEffect, useRef, useState } from "react";
import { ArrowUp, Volume2, VolumeX } from "lucide-react";
import { evaluate } from "@/lib/prometheus/guards";
import { filesToIncoming, readDirectory } from "@/lib/prime/grant";
import { usePrime } from "@/lib/prime/store";

const SUGGESTIONS = ["Drives", "Notes", "Analyze", "More"];

export function Deck() {
  const lines = usePrime((s) => s.lines);
  const voice = usePrime((s) => s.voice);
  const policy = usePrime((s) => s.policy);
  const reds = usePrime((s) => evaluate(s.kernel).filter((g) => g.status === "fail").length);
  const send = usePrime((s) => s.send);
  const absorb = usePrime((s) => s.absorb);
  const setVoice = usePrime((s) => s.setVoice);
  const tickWatch = usePrime((s) => s.tickWatch);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = usePrime.persist.onFinishHydration(() => {
      usePrime.setState({ hydrated: true, pending: false });
    });
    void Promise.resolve(usePrime.persist.rehydrate()).finally(() => {
      if (!usePrime.getState().hydrated) usePrime.setState({ hydrated: true, pending: false });
    });
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "/" && document.activeElement !== field.current) {
        event.preventDefault();
        field.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!policy.serve && (!policy.online || !policy.watch)) return;
    const id = window.setInterval(() => {
      void tickWatch();
    }, (policy.pace === 300 ? 300 : 60) * 1000);
    return () => window.clearInterval(id);
  }, [policy.online, policy.watch, policy.pace, policy.serve, tickWatch]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  function submit(text: string) {
    const next = text.trim();
    if (!next) return;
    setDraft("");
    void send(next);
    field.current?.focus();
  }

  async function grantFolder() {
    const picker = (window as unknown as { showDirectoryPicker?: (opts: { mode: "read" }) => Promise<{ name: string; kind: string; entries: () => AsyncIterable<[string, { kind: string; getFile?: () => Promise<File> }]> }> }).showDirectoryPicker;
    if (picker) {
      try {
        const dir = await picker({ mode: "read" });
        const files = await readDirectory(dir);
        await absorb(await filesToIncoming(files), dir.name);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    folder.current?.click();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="live-dot" data-on={policy.watch && policy.online ? "true" : "false"} aria-hidden="true" />
            <h1 className="text-lg font-medium tracking-tight">Prime</h1>
          </div>
          <p className="text-sm text-muted">In service.</p>
        </div>
        <p className="text-right text-xs text-faint tabular-nums">
          {policy.online ? (policy.watch ? "Online" : "Online, holding") : "Offline"}
          <span className="block">
            {reds} red · {policy.lock ? "lock on" : "lock off"}
          </span>
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
        {lines.map((line) =>
          line.role === "commander" ? (
            <p key={line.id} className="text-sm text-muted">
              {line.text}
            </p>
          ) : (
            <article key={line.id} className="flex flex-col gap-2">
              <p className="text-lg font-medium leading-snug">{line.text}</p>
              {line.id === lines[lines.length - 1]?.id && (
                <button
                  type="button"
                  className="press min-h-11 w-fit rounded-md border border-line px-3 text-sm text-muted"
                  onClick={() => {
                    const clip = navigator.clipboard;
                    if (!clip) return;
                    void clip.writeText(line.text).then(() => setCopied(line.id));
                  }}
                >
                  {copied === line.id ? "Copied" : "Copy"}
                </button>
              )}
              {line.diff && (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
                  <p className="text-faint">Was</p>
                  <p>{line.diff.was}</p>
                  <p className="mt-2 text-faint">Now</p>
                  <p>{line.diff.now}</p>
                </div>
              )}
              {line.evidence.length > 0 && (
                <details className="text-xs text-faint">
                  <summary className="cursor-pointer py-1">Evidence</summary>
                  <ul className="mt-1 flex flex-col gap-1 font-mono">
                    {line.evidence.map((item) => (
                      <li key={item} className="break-words">
                        {item}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ),
        )}
        <div ref={end} />
      </main>

      <div className="dock border-t border-line bg-bg">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="press min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-fg"
              onClick={() => void grantFolder()}
            >
              Grant folder
            </button>
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className="press min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-fg"
                onClick={() => submit(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <input
            ref={folder}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const list = event.target.files;
              if (!list || list.length === 0) return;
              void filesToIncoming([...list]).then((incoming) => absorb(incoming, "Granted folder"));
              event.target.value = "";
            }}
            {...{ webkitdirectory: "", directory: "" }}
          />
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit(draft);
            }}
          >
            <label className="sr-only" htmlFor="order">
              Order
            </label>
            <input
              id="order"
              ref={field}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Give Prime an order"
              className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-base text-fg outline-none placeholder:text-faint"
              autoComplete="off"
            />
            <button
              type="button"
              className="press grid h-11 w-11 place-items-center rounded-md border border-line text-fg"
              aria-pressed={voice}
              aria-label={voice ? "Voice on" : "Voice off"}
              onClick={() => setVoice(!voice)}
            >
              {voice ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
            </button>
            <button
              type="submit"
              className="press grid h-11 w-11 place-items-center rounded-md bg-accent text-accent-fg"
              aria-label="Send"
              disabled={draft.trim().length === 0}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
