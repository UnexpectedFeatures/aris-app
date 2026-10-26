export type SupportTicket = {
  id: string;
  title: string;
  header: string;
  customer: string;
  description?: string;
  priority: "Low" | "Medium" | "High";
  status: "Open" | "Closed";
  date: string;
};

const STORAGE_KEY = "aris-support-tickets";

export function getSupportTickets(fallback: SupportTicket[]): SupportTicket[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return fallback;

  try {
    const tickets: unknown = JSON.parse(stored);
    if (!Array.isArray(tickets)) {
      throw new Error("Saved support tickets are not a list.");
    }
    return [...fallback, ...tickets.filter(isSupportTicket)];
  } catch (reason) {
    localStorage.removeItem(STORAGE_KEY);
    console.error("Unable to read saved support tickets.", reason);
    return fallback;
  }
}

export function createSupportTicket(
  ticket: Omit<SupportTicket, "id" | "status" | "date">,
): SupportTicket {
  const created: SupportTicket = {
    ...ticket,
    id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "Open",
    date: "Today",
  };
  const stored = readStoredTickets();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...stored, created]));
  return created;
}

function readStoredTickets(): SupportTicket[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const tickets: unknown = JSON.parse(stored);
    if (!Array.isArray(tickets)) {
      throw new Error("Saved support tickets are not a list.");
    }
    return tickets.filter(isSupportTicket);
  } catch (reason) {
    localStorage.removeItem(STORAGE_KEY);
    console.error("Unable to read saved support tickets.", reason);
    return [];
  }
}

function isSupportTicket(value: unknown): value is SupportTicket {
  if (!value || typeof value !== "object") return false;
  const ticket = value as Partial<SupportTicket>;
  return typeof ticket.id === "string"
    && typeof ticket.title === "string"
    && typeof ticket.header === "string"
    && typeof ticket.customer === "string"
    && (ticket.description === undefined || typeof ticket.description === "string")
    && (ticket.priority === "Low" || ticket.priority === "Medium" || ticket.priority === "High")
    && (ticket.status === "Open" || ticket.status === "Closed")
    && typeof ticket.date === "string";
}
