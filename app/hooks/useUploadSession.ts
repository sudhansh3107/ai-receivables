import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useUploadSession(sessionId: string | null) {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Load the current session first
    const loadSession = async () => {
      const { data, error } = await supabase
        .from("upload_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (!error) {
        setSession(data);
      }
    };

    loadSession();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`upload-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "upload_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          console.log("Realtime Update:", payload.new.processed_files, payload.new.processing_status);
          setSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return session;
}