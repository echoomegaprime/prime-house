export interface PurseLane {
  id: string;
  name: string;
  next: string;
  subject: string;
}

export interface FiledLane {
  id: string;
  name: string;
  next: string;
}

export interface Booked {
  amount: number;
  note: string;
  stamp: number;
}

export const LANES: PurseLane[] = [
  {
    id: "title",
    name: "Title and ROW",
    next: "Research price, rivals, cost, reason, risk, and terms before any send.",
    subject: "oil and gas chain of title software",
  },
  {
    id: "stay",
    name: "Right at Home",
    next: "Name one paid concierge add-on for a booked stay.",
    subject: "short term rental concierge",
  },
  {
    id: "office",
    name: "Echo Office",
    next: "Name one company that would pay for a seat, and the price the commander sets.",
    subject: "virtual employee software",
  },
  {
    id: "county",
    name: "County pilot",
    next: "Pick one Texas county and the record set a pilot would search.",
    subject: "Texas county deed records",
  },
  {
    id: "channel",
    name: "Bloodline channel",
    next: "One faceless video that can carry ads. Script, title, thumbnail. No upload until asked.",
    subject: "faceless youtube channel",
  },
  {
    id: "carpentry",
    name: "Carpentry quotes",
    next: "One public quote path on the carpentry site.",
    subject: "custom carpentry leads",
  },
  {
    id: "trees",
    name: "Tree and limb",
    next: "One storm-season offer. Price stays with the owner.",
    subject: "tree removal service",
  },
  {
    id: "cert",
    name: "Release review",
    next: "One paid review of a release packet. The commander names the fee.",
    subject: "software release certification",
  },
];

export function bookedTotal(rows: Booked[]): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export interface Facet {
  key: string;
  text: string;
  source: string;
}

export interface Dossier {
  laneId: string;
  buyer: string;
  facets: Facet[];
}

export const NEED = ["price", "rival", "offer", "cost", "reason", "risk", "terms", "buyer"] as const;

export const ASKS: Record<string, string> = {
  price: "oil and gas land software monthly price",
  rival: "oil and gas land software competitors",
  offer: "chain of title automation scope of work",
  cost: "cost of title curative work",
  reason: "why operators buy land management software",
  risk: "title opinion liability",
  terms: "professional services payment terms",
};

const CITED: Record<string, Facet[]> = {
  title: [
    {
      key: "price",
      text: "Capterra lists Tracts at $2,000 per month and MineralFile at $500 per user per month, August 2026. RigER lists $50 per user per month for field tickets, which is not title software. Our fee is not set.",
      source: "https://www.capterra.com/p/164035/Tracts/",
    },
    {
      key: "rival",
      text: "Public list prices on that page: Tracts $2,000 per month, MineralFile $500 per user per month.",
      source: "https://www.capterra.com/p/164035/Tracts/",
    },
  ],
};

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function filled(dossier: Dossier, key: string): boolean {
  if (key === "buyer") return isEmail(dossier.buyer);
  const facet = dossier.facets.find((item) => item.key === key);
  if (!facet?.text || !facet.source) return false;
  if (key === "price" && !/\d/.test(facet.text)) return false;
  if (key !== "offer" && !/^https?:\/\//.test(facet.source)) return false;
  return true;
}

export function score(dossier: Dossier): number {
  const got = NEED.filter((key) => filled(dossier, key)).length;
  return Math.round((got / NEED.length) * 100);
}

export function missing(dossier: Dossier): string[] {
  return NEED.filter((key) => !filled(dossier, key));
}

export function openDossier(laneId: string): Dossier {
  return {
    laneId,
    buyer: "",
    facets: (CITED[laneId] ?? []).map((facet) => ({ ...facet })),
  };
}

export function nextAsk(dossier: Dossier): string {
  const gap = missing(dossier).find((key) => key !== "buyer");
  return gap ? ASKS[gap] : "";
}

export function isHouseTopic(topic: string): boolean {
  if (!topic) return true;
  return LANES.some((lane) => lane.subject === topic) || Object.values(ASKS).includes(topic);
}

export function absorbLesson(dossier: Dossier, lesson: { text: string; source: string } | undefined): Dossier {
  if (!lesson || lesson.text.length < 40 || !/^https?:\/\//.test(lesson.source)) return dossier;
  const gap = missing(dossier).find((key) => key !== "buyer");
  if (!gap || gap === "offer") return dossier;
  if (gap === "price" && !/\d/.test(lesson.text)) return dossier;
  if (dossier.facets.some((facet) => facet.key === gap)) return dossier;
  return {
    ...dossier,
    facets: [...dossier.facets, { key: gap, text: lesson.text.slice(0, 280), source: lesson.source.slice(0, 300) }],
  };
}

export function huntLine(name: string, dossier: Dossier, booked: Booked[]): string {
  const gap = missing(dossier);
  return `${name}. Confidence ${score(dossier)}. Missing ${gap.join(", ") || "nothing"}. ${moneyLine(booked)}`;
}

export function moneyLine(booked: Booked[]): string {
  return `Booked ${bookedTotal(booked)}. I do not spend. I send only at confidence 100.`;
}

export function fileLane(filed: FiledLane[]): { lane: PurseLane; filed: FiledLane[] } | null {
  const have = new Set(filed.map((row) => row.id));
  const lane = LANES.find((item) => !have.has(item.id));
  if (!lane) return null;
  return {
    lane,
    filed: [...filed, { id: lane.id, name: lane.name, next: lane.next }].slice(-12),
  };
}

export function nextSubject(topic: string): string | null {
  const subjects = LANES.map((lane) => lane.subject);
  if (topic && !subjects.includes(topic)) return null;
  const index = subjects.indexOf(topic);
  return subjects[(index + 1) % subjects.length];
}

export function parseBook(text: string): { amount: number; note: string } | null {
  const match = text.match(/^book\s+(\d{1,7})\s+(.{2,80})$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount < 1) return null;
  return { amount, note: match[2].trim() };
}
