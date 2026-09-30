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
    next: "Write the one-page offer for a Permian operator. Do not send it until the commander says so.",
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

export function moneyLine(booked: Booked[]): string {
  return `Booked ${bookedTotal(booked)}. I do not spend and I do not send.`;
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
