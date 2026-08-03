import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type YardPilotNotification = {
  id: string;
  workspace_id: string | null;
  type: string;
  title: string;
  message: string;
  action_url: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(userId: string | null, limit = 50) {
  const [notifications, setNotifications] = useState<YardPilotNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select("id, workspace_id, type, title, message, action_url, data, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (loadError) setError(loadError.message);
    else {
      setError("");
      setNotifications((data ?? []) as YardPilotNotification[]);
    }
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => {
    void load();
    if (!userId) return;
    const channel = supabase
      .channel(`yardpilot-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  async function markRead(id: string) {
    if (!userId) return;
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item
      )
    );
  }

  async function markAllRead() {
    const { error: rpcError } = await supabase.rpc("mark_all_notifications_read");
    if (rpcError) throw new Error(rpcError.message);
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  }

  async function remove(id: string) {
    if (!userId) return;
    const { error: deleteError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (deleteError) throw new Error(deleteError.message);
    setNotifications((current) => current.filter((item) => item.id !== id));
  }

  return { notifications, unreadCount, loading, error, load, markRead, markAllRead, remove };
}
