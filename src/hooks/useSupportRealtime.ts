import { useEffect, useRef } from "react";
import { supabase } from "@/services/supabase";

export function useSupportRealtime(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const client = supabase;
    if (!client) {
      // Fallback polling only if supabase client is not configured
      const interval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          onChangeRef.current();
        }
      }, 4000);
      return () => clearInterval(interval);
    }

    const channelName = `support-tickets-sync-${Math.random().toString(36).slice(2, 9)}`;
    const channel = client
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => {
          onChangeRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_messages" },
        () => {
          onChangeRef.current();
        },
      )
      .subscribe();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        onChangeRef.current();
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, []);
}
