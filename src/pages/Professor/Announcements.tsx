import { useState, useMemo } from "react";
import { BRAND } from "@/config/navigation";
import { Card, PageTitle, Badge, Tabs, initialsColor, GhostButton } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import { saveResource } from "@/services/dataSource";

const demoPosts = [
  { id: "demo-1", title: "AR submission closes Friday 5 PM", body: "All Accomplishment Reports for September Cycle 1 must be submitted before the Friday 5:00 PM cut-off. Late entries roll to the next cycle.", tag: "AR / DTR", tone: "green" as const, initials: "AR", date: "1 hour ago", pinned: true },
  { id: "demo-2", title: "System maintenance: Sept 10, 2–4 AM", body: "ARIS will be briefly unavailable during scheduled maintenance. Submit any pending AR / DTR records before the window opens.", tag: "System", tone: "amber" as const, initials: "SY", date: "2 days ago", pinned: true },
  { id: "demo-3", title: "AI/ML anomaly: late-submission spike", body: "The analytics engine detected a rise in after-hours DTR submissions. A reminder will auto-send Thursday 3 PM to reduce the Friday backlog.", tag: "AI / ML", tone: "blue" as const, initials: "AI", date: "2 days ago", pinned: false },
  { id: "demo-4", title: "DTR name must match the official roster", body: "Please ensure the name on your DTR matches your roster entry exactly — mismatches are flagged and delay verification.", tag: "AR / DTR", tone: "green" as const, initials: "DT", date: "4 days ago", pinned: false },
];

type UnifiedItem = {
  id: string;
  title: string;
  body: string;
  tag: string;
  tone: "green" | "amber" | "blue" | "gray" | "red";
  initials: string;
  pinned: boolean;
  date: string;
  is_read?: boolean;
};

type RawAnnouncement = {
  id?: string;
  title?: string;
  body?: string;
  description?: string;
  tag?: string;
  category?: string;
  pinned?: boolean;
  isPinned?: boolean;
  date?: string;
  publishedAt?: string;
  createdAt?: string;
};

type RawNotification = {
  id?: string;
  title?: string;
  description?: string;
  body?: string;
  type?: string;
  category?: string;
  is_read?: boolean;
  created_at?: string;
  pinned?: boolean;
};

const formatDate = (val?: string) => {
  if (!val) return "Recent";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? val : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const toneFromCategory = (cat?: string): "green" | "amber" | "blue" | "gray" | "red" => {
  if (cat === "System") return "amber";
  if (cat === "AI / ML") return "blue";
  if (cat === "Urgent") return "red";
  if (cat === "General") return "gray";
  return "green";
};

const STORAGE_KEY = "aris_app_read_notifications";

export default function ProfAnnouncements() {
  const [tab, setTab] = useState("All");
  const { data: rawPosts, loading: loadingPosts, error: errorPosts } =
    useResource<RawAnnouncement[]>("/announcements", demoPosts);
  const { data: rawNotifs, loading: loadingNotifs, error: errorNotifs } =
    useResource<RawNotification[]>("/notifications", []);

  // Persistent read state in app
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markAsRead = async (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

    try {
      await saveResource(`/notifications/${id}/read`, undefined, "PATCH");
    } catch {}
  };

  const toggleRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (readIds.has(id)) {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
        } catch {}
        return next;
      });
    } else {
      markAsRead(id);
    }
  };

  const markAllAsRead = async () => {
    const allIds = unifiedItems.map((p) => p.id);
    setReadIds(new Set(allIds));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allIds));
      await saveResource("/notifications/read-all", undefined, "PATCH");
    } catch {}
  };

  // Unify announcements and notifications into a single deduplicated feed
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const list: UnifiedItem[] = [];
    const seen = new Set<string>();

    const safePosts = Array.isArray(rawPosts) ? rawPosts : [];
    const safeNotifs = Array.isArray(rawNotifs) ? rawNotifs : [];

    // Add announcements
    for (const p of safePosts) {
      const title = p.title || "Announcement";
      const key = (p.id || title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const tag = p.tag || p.category || "General";
      list.push({
        id: p.id || key,
        title,
        body: p.body || p.description || "",
        tag,
        tone: toneFromCategory(tag),
        initials: title.slice(0, 2).toUpperCase(),
        pinned: Boolean(p.pinned ?? p.isPinned),
        date: formatDate(p.date || p.publishedAt || p.createdAt),
      });
    }

    // Merge notifications into the same list
    for (const n of safeNotifs) {
      const title = n.title || "Notification";
      const key = (n.id || title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const tag = n.category || (n.type ? n.type.replace(/_/g, " ").toUpperCase() : "General");
      list.push({
        id: n.id || key,
        title,
        body: n.body || n.description || "",
        tag,
        tone: toneFromCategory(tag),
        initials: title.slice(0, 2).toUpperCase(),
        pinned: Boolean(n.pinned),
        date: formatDate(n.created_at),
        is_read: n.is_read,
      });
    }

    return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [rawPosts, rawNotifs]);

  const unreadCount = useMemo(() => {
    return unifiedItems.filter((p) => !readIds.has(p.id) && !p.is_read).length;
  }, [unifiedItems, readIds]);

  const tabs = ["All", `Unread (${unreadCount})`, "AR / DTR", "System", "AI / ML", "General"];

  const visible = unifiedItems.filter((p) => {
    const isRead = readIds.has(p.id) || Boolean(p.is_read);
    if (tab.startsWith("Unread")) return !isRead;
    if (tab === "All") return true;
    return p.tag.toLowerCase().includes(tab.toLowerCase());
  });

  const loading = loadingPosts && loadingNotifs;
  const error = errorPosts || errorNotifs;

  return (
    <div className="pb-4">
      <PageTitle
        title="Notifications"
        subtitle="View your system reminders and notifications."
        action={
          unreadCount > 0 ? (
            <GhostButton onClick={markAllAsRead}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[#3a7d4e]">
                <path d="M18 6L7 17l-5-5" />
                <path d="M22 10l-7.5 7.5-1.5-1.5" />
              </svg>
              Mark all as read
            </GhostButton>
          ) : (
            <span className="text-[12.5px] font-medium text-[#8fa394] flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-[#f0f4f1]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-[#3a7d4e]">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              All caught up
            </span>
          )
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="mb-4">
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
          </div>
          {error && <p className="mb-3 text-[12px] text-red-600">{error}</p>}
          {loading && <p className="mb-3 text-[12px]" style={{ color: "#8fa394" }}>Loading notifications...</p>}
          <div className="space-y-3">
            {!loading && visible.length === 0 && (
              <Card className="text-center py-8">
                <p className="text-[13px]" style={{ color: "#8fa394" }}>No notifications found.</p>
              </Card>
            )}
            {visible.map((p) => {
              const isRead = readIds.has(p.id) || Boolean(p.is_read);

              return (
                <Card
                  key={p.id}
                  onClick={() => !isRead && markAsRead(p.id)}
                  className={`flex gap-4 cursor-pointer transition-all border ${
                    isRead ? "bg-white/80 border-[#edf2ee]" : "bg-white border-[#c8e6d0] shadow-sm"
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0"
                    style={{ background: initialsColor(p.title.length), opacity: isRead ? 0.7 : 1 }}
                  >
                    {p.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className={`text-[15px] truncate ${isRead ? "font-medium text-[#405145]" : "font-semibold text-[#111c14]"}`}>
                          {p.title}
                        </p>
                        {p.pinned && (
                          <svg viewBox="0 0 24 24" fill={BRAND} stroke="none" className="w-3.5 h-3.5 flex-shrink-0">
                            <path d="M9 4v6l-2 4h10l-2-4V4M12 18v4M8 4h8" />
                          </svg>
                        )}
                        {!isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#3a7d4e] flex-shrink-0" title="Unread" />
                        )}
                      </div>

                      {/* Read status toggle button */}
                      <button
                        type="button"
                        onClick={(e) => toggleRead(p.id, e)}
                        title={isRead ? "Mark as unread" : "Mark as read"}
                        className="text-[12px] font-medium px-2 py-0.5 rounded-lg border text-[#5a6b5e] hover:text-[#111c14] hover:bg-[#f4f6f5] transition-colors flex items-center gap-1 flex-shrink-0"
                        style={{ borderColor: "#e2e8e4" }}
                      >
                        {isRead ? (
                          <>
                            <span className="text-[#8fa394]">✓</span>
                            <span>Read</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[#3a7d4e] font-bold">✓</span>
                            <span className="text-[#3a7d4e]">Mark read</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className={`text-[13px] leading-relaxed line-clamp-2 ${isRead ? "text-[#7a8c7e]" : "text-[#5a6b5e]"}`}>
                      {p.body}
                    </p>

                    <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[#f4f6f5]">
                      <Badge tone={p.tone}>{p.tag}</Badge>
                      <Badge tone={isRead ? "gray" : "green"} dot={!isRead}>
                        {isRead ? "Read" : "Unread"}
                      </Badge>
                      <span className="text-[12px] ml-auto" style={{ color: "#8fa394" }}>
                        {p.date}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <Card>
          <p className="text-[13px] font-semibold mb-3" style={{ color: "#111c14" }}>
            Pinned Notices
          </p>
          <div className="space-y-3">
            {unifiedItems.filter((p) => p.pinned).length === 0 && (
              <p className="text-[12px]" style={{ color: "#8fa394" }}>No pinned notices.</p>
            )}
            {unifiedItems
              .filter((p) => p.pinned)
              .map((p) => (
                <div key={p.id} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: BRAND }} />
                  <div>
                    <p className="text-[12.5px] leading-snug font-medium" style={{ color: "#3d4a41" }}>
                      {p.title}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "#8fa394" }}>
                      {p.tag} • {p.date}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
