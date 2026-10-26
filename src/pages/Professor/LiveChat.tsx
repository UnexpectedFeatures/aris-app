import { useState, type FormEvent } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "@/app/authContext";
import { BRAND } from "@/config/navigation";
import { Card, PageTitle } from "@/components/ui";

type Message = { id: number; text: string; fromMe: boolean };

export default function LiveChat() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const basePath = user.role === "staff" ? "/staff" : "/prof";

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: Date.now(), text, fromMe: true },
      {
        id: Date.now() + 1,
        text: "This Live Chat preview is not connected to a support agent. Create a ticket in Support to save your request in ARIS.",
        fromMe: false,
      },
    ]);
    setMessage("");
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col pb-2">
      <PageTitle
        title="Live Chat"
        subtitle="A preview of the in-app support chat experience."
        action={
          <button
            type="button"
            onClick={() => navigate(`${basePath}/support`)}
            className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-[12px] font-medium text-[#3d4a41]"
            style={{ borderColor: "#e2e8e4" }}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Support
          </button>
        }
      />
      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: "#eef1ef" }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: BRAND }}>AR</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[#111c14]">ARIS Help Desk</p>
            <p className="text-[11px] text-[#8fa394]">Live Chat preview · Local demo</p>
          </div>
          <span className="rounded-full bg-[#fbf1de] px-2.5 py-1 text-[10px] font-medium text-[#996515]">Not connected</span>
        </div>
        <div className="flex min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto py-4">
          <p className="max-w-xl self-start rounded-2xl rounded-bl-sm bg-[#f4f6f5] px-3 py-2 text-[12px] leading-relaxed text-[#3d4a41]">
            Hello, {user.name}. You can try the chat interface here. This preview does not send messages to a real support agent.
          </p>
          {messages.map((item) => (
            <p
              key={item.id}
              className={`max-w-xl rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${item.fromMe ? "self-end rounded-br-sm text-white" : "self-start rounded-bl-sm bg-[#f4f6f5] text-[#3d4a41]"}`}
              style={item.fromMe ? { background: BRAND } : undefined}
            >
              {item.text}
            </p>
          ))}
        </div>
        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t pt-3" style={{ borderColor: "#eef1ef" }}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label="Message to ARIS Help Desk"
            placeholder="Write a message..."
            className="h-10 min-w-0 flex-1 rounded-xl border bg-white px-3 text-[12px] outline-none focus:border-[#3a7d4e]"
            style={{ borderColor: "#e2e8e4" }}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="flex h-10 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ background: BRAND }}
          >
            <Send size={14} aria-hidden="true" />
            Send
          </button>
        </form>
      </Card>
    </div>
  );
}
