import { useEffect, useMemo, useState } from "react"
import { Filter, MessageSquare, Search, Send, UserRound } from "lucide-react"
import { useSearchParams } from "react-router"
import { getSupportTickets, type SupportTicket } from "@/services/supportTickets"

type TicketStatus = "Open" | "Closed"
type Ticket = SupportTicket
type ChatMessage = {
  id: string
  text: string
  time: string
  fromMe: boolean
}

const initialTickets: Ticket[] = []
const initialMessages: ChatMessage[] = []

type TicketFilter = "All" | TicketStatus

function PriorityBadge({ priority }: { priority: Ticket["priority"] }) {
  const colors = {
    Low: { background: "#dcebe1", color: "#3a7d4e" },
    Medium: { background: "#fbf1de", color: "#996515" },
    High: { background: "#fbecec", color: "#c0392b" },
  }[priority]

  return (
    <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={colors}>
      {priority}
    </span>
  )
}

function Avatar() {
  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white"
      style={{ color: "#5a6b5e" }}
      aria-label="User"
    >
      <UserRound size={15} strokeWidth={1.6} aria-hidden="true" />
    </span>
  )
}

export default function ProfChat() {
  const [searchParams] = useSearchParams()
  const ticketFromUrl = searchParams.get("ticket")
  const [tickets, setTickets] = useState(() => getSupportTickets(initialTickets))
  const [selectedTicketId, setSelectedTicketId] = useState(() =>
    tickets.find((ticket) => ticket.id === ticketFromUrl)?.id ?? tickets[0]?.id ?? "",
  )
  const [messages, setMessages] = useState(initialMessages)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<TicketFilter>("All")
  const [showFilters, setShowFilters] = useState(false)
  const [response, setResponse] = useState("")

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId)
  useEffect(() => {
    const ticket = tickets.find((item) => item.id === selectedTicketId)
    setMessages(ticket?.description
      ? [{
          id: `${ticket.id}-description`,
          text: ticket.description,
          time: ticket.date,
          fromMe: true,
        }]
      : initialMessages)
  }, [selectedTicketId, tickets])
  const visibleTickets = useMemo(() => tickets.filter((ticket) => {
    const matchesQuery = `${ticket.title} ${ticket.customer}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (filter === "All" || ticket.status === filter)
  }), [tickets, query, filter])

  const sendResponse = () => {
    const text = response.trim()
    if (!text || !selectedTicket || selectedTicket.status === "Closed") return
    setMessages((current) => [
      ...current,
      {
        id: `message-${Date.now()}`,
        text,
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        fromMe: true,
      },
    ])
    setResponse("")
  }

  const toggleTicketStatus = () => {
    if (!selectedTicket) return
    setTickets((current) => current.map((ticket) =>
      ticket.id === selectedTicket.id
        ? { ...ticket, status: ticket.status === "Open" ? "Closed" : "Open" }
        : ticket,
    ))
  }

  return (
    <section className="flex min-h-[560px] flex-col text-[#111c14] lg:h-full">
      <div className="grid flex-shrink-0 grid-cols-1 gap-4 pb-3 md:grid-cols-[minmax(220px,1fr)_minmax(0,2.4fr)]">
        <header>
          <h1 className="text-[22px] font-bold tracking-tight">Chat</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: "#8fa394" }}>
            Manage your ticket.
          </p>
        </header>

        <div className="flex items-start justify-between gap-3">
          {selectedTicket ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[16px] font-bold">{selectedTicket.header}</h2>
                <PriorityBadge priority={selectedTicket.priority} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-medium" style={{ color: "#5a6b5e" }}>
                <UserRound size={12} aria-hidden="true" />
                <span>{selectedTicket.customer}</span>
                <span aria-hidden="true">·</span>
                <MessageSquare size={12} aria-hidden="true" />
                <span>{selectedTicket.title}</span>
              </div>
            </div>
          ) : (
            <h2 className="text-[16px] font-bold">Select a ticket</h2>
          )}
          {selectedTicket && (
            <button
              type="button"
              onClick={toggleTicketStatus}
              className="flex-shrink-0 rounded-xl border px-3 py-1.5 text-[10px] font-medium transition-colors hover:bg-white"
              style={{
                borderColor: selectedTicket.status === "Closed" ? "#b8d4c0" : "#e2e8e4",
                background: selectedTicket.status === "Closed" ? "#e3eee6" : "#fff",
                color: "#5a6b5e",
              }}
            >
              Ticket {selectedTicket.status}
            </button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(220px,1fr)_minmax(0,2.4fr)]">
        <aside className="flex min-h-[180px] flex-col">
          <div className="mb-2 flex gap-1.5">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-white px-2.5" style={{ borderColor: "#e2e8e4" }}>
              <Search size={13} aria-hidden="true" style={{ color: "#8fa394" }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Tickets..."
                aria-label="Search tickets"
                className="w-full min-w-0 bg-transparent text-[10px] outline-none placeholder:text-[#8fa394]"
              />
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFilters((open) => !open)}
                aria-expanded={showFilters}
                className="flex h-8 items-center gap-1 rounded-xl border bg-white px-2 text-[10px]"
                style={{ borderColor: "#e2e8e4", color: "#5a6b5e" }}
              >
                <Filter size={12} aria-hidden="true" />
                Filter
              </button>
              {showFilters && (
                <div className="absolute right-0 top-9 z-10 w-28 rounded-xl border bg-white p-1 shadow-lg" style={{ borderColor: "#e2e8e4" }}>
                  {(["All", "Open", "Closed"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => {
                        setFilter(value)
                        setShowFilters(false)
                      }}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-[10px] hover:bg-[#f4f6f5]"
                      style={{ color: filter === value ? "#3a7d4e" : "#5a6b5e" }}
                    >
                      {value} tickets
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 space-y-1 overflow-y-auto">
            {visibleTickets.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                className="w-full rounded-xl bg-white p-2 text-left transition-colors hover:bg-[#f8fbf9]"
                style={{
                  border: `1px solid ${selectedTicketId === ticket.id ? "#dcebe1" : "transparent"}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold" style={{ color: "#3d4a41" }}>{ticket.title}</span>
                  <span className="flex-shrink-0 text-[8px]" style={{ color: "#8fa394" }}>{ticket.date}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <UserRound size={12} aria-hidden="true" style={{ color: "#5a6b5e" }} />
                  <span className="min-w-0 flex-1 truncate text-[9px]" style={{ color: "#5a6b5e" }}>{ticket.customer}</span>
                  <PriorityBadge priority={ticket.priority} />
                  <span className="rounded-full bg-[#e7f1fa] px-2 py-0.5 text-[8px] font-medium text-[#2b6ca3]">{ticket.status}</span>
                </div>
              </button>
            ))}
            {visibleTickets.length === 0 && (
              <p className="rounded-xl bg-white p-3 text-[10px]" style={{ color: "#8fa394" }}>No matching tickets.</p>
            )}
          </div>
        </aside>

        <div className="flex min-h-[330px] min-w-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-5 overflow-y-auto py-2">
            {selectedTicket && messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${message.fromMe ? "justify-end" : "justify-start"}`}
              >
                {message.fromMe && <Avatar />}
                <div className={`max-w-[75%] ${message.fromMe ? "items-end" : "items-start"} flex flex-col`}>
                  <p
                    className={`rounded-2xl px-3 py-2 text-md ${
                      message.fromMe ? "rounded-br-md text-white" : "rounded-bl-md bg-white"
                    }`}
                    style={message.fromMe ? { background: "#3a7d4e" } : { color: "#3d4a41" }}
                  >
                    {message.text}
                  </p>
                  <time className="mt-1 px-1 text-sm" style={{ color: "#5a6b5e" }}>{message.time}</time>
                </div>
                {!message.fromMe && <Avatar />}
              </div>
            ))}
            {!selectedTicket && (
              <p className="text-center text-[11px]" style={{ color: "#8fa394" }}>Choose a ticket to view the conversation.</p>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              sendResponse()
            }}
            className="mt-3 flex flex-shrink-0 items-center gap-2 rounded-2xl bg-white p-1.5 pl-3"
          >
            <input
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder={selectedTicket?.status === "Closed" ? "This ticket is closed." : "Type your response here..."}
              aria-label="Your response"
              disabled={!selectedTicket || selectedTicket.status === "Closed"}
              className="min-w-0 flex-1 bg-transparent text-[10px] outline-none placeholder:text-[#5a6b5e] disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!response.trim() || !selectedTicket || selectedTicket.status === "Closed"}
              className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-[10px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "#3a7d4e" }}
            >
              <Send size={12} aria-hidden="true" />
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
