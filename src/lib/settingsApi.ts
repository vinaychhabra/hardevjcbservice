import { supabase } from "../lib/supabase";

export async function getSetting<T>(namespace: string, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("settings").select("value").eq("namespace", namespace).eq("key", key).maybeSingle();
  return data ? (data.value as T) : fallback;
}

export async function upsertSetting(namespace: string, key: string, value: Record<string, unknown>) {
  // Requires the (tenant_id, namespace, key) unique constraint from
  // migration 0001 — this is what makes "modify everything" work as a
  // single reusable write path instead of one mutation per setting.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: { message: "Not signed in" } };

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userData.user.id).single();
  if (!profile) return { error: { message: "No profile found for this user" } };

  return supabase
    .from("settings")
    .upsert({ tenant_id: profile.tenant_id, namespace, key, value }, { onConflict: "tenant_id,namespace,key" });
}
