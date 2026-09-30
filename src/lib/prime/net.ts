export function publicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return false;
  }
  if (host === "metadata.google.internal" || host === "metadata.google") return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map((n) => Number(n));
    if (parts.some((n) => n > 255)) return false;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (host.includes(":")) {
    if (host === "::1" || host === "::") return false;
    if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false;
    if (host.startsWith("::ffff:")) return publicHost(host.slice(7));
    return true;
  }
  return true;
}

export function publicUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!publicHost(url.hostname)) return null;
  url.hash = "";
  return url.toString().slice(0, 300);
}

export function ipIsPublic(address: string): boolean {
  return publicHost(address);
}
