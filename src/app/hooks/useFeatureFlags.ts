import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type YardPilotFeatureFlag =
  | "public_registration"
  | "marketplace_bidding"
  | "marketplace_hiring"
  | "browser_push"
  | "ai_assistant"
  | "real_payroll";

type FlagMap = Partial<Record<YardPilotFeatureFlag, boolean>>;

const SAFE_DEFAULTS: Record<YardPilotFeatureFlag, boolean> = {
  public_registration: false,
  marketplace_bidding: false,
  marketplace_hiring: false,
  browser_push: false,
  ai_assistant: false,
  real_payroll: false,
};

export function useFeatureFlags(requested: YardPilotFeatureFlag[]) {
  const key = requested.slice().sort().join(",");
  const [remote, setRemote] = useState<FlagMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!requested.length) {
        if (active) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("feature_flags")
        .select("key, enabled")
        .in("key", requested);

      if (!active) return;
      if (!error) {
        setRemote(
          Object.fromEntries(
            (data ?? []).map((row) => [row.key as YardPilotFeatureFlag, Boolean(row.enabled)]),
          ),
        );
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
    // A stable string prevents a fetch loop when callers pass an inline array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const flags = useMemo(
    () => Object.fromEntries(
      requested.map((flag) => [flag, remote[flag] ?? SAFE_DEFAULTS[flag]]),
    ) as Record<YardPilotFeatureFlag, boolean>,
    [key, remote],
  );

  return { flags, loading };
}
