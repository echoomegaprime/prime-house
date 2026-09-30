import { mayRead } from "./absorb.ts";

export interface GrantedFile {
  name: string;
  text: string;
}

interface Entry {
  kind: string;
  entries?: () => AsyncIterable<[string, Entry]>;
  getFile?: () => Promise<File>;
}

export async function readDirectory(dir: { entries: () => AsyncIterable<[string, Entry]> }, depth = 0, out: File[] = []): Promise<File[]> {
  if (depth > 2) return out;
  for await (const [name, handle] of dir.entries()) {
    if (out.length >= 80) return out;
    if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
    if (handle.kind === "file" && handle.getFile) {
      if (!mayRead(name)) continue;
      const file = await handle.getFile();
      if (file.size === 0 || file.size > 64_000) continue;
      out.push(file);
    } else if (handle.kind === "directory" && handle.entries) {
      await readDirectory(handle as { entries: () => AsyncIterable<[string, Entry]> }, depth + 1, out);
    }
  }
  return out;
}

export async function filesToIncoming(files: File[]): Promise<GrantedFile[]> {
  const incoming: GrantedFile[] = [];
  for (const file of files) {
    if (!mayRead(file.name) || file.size === 0 || file.size > 64_000) continue;
    const text = (await file.text()).slice(0, 4000);
    if (!text || text.includes("\u0000")) continue;
    incoming.push({ name: file.webkitRelativePath || file.name, text });
  }
  return incoming;
}

export function canPickDirectory(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
