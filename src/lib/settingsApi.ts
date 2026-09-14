import { supabase } from "../lib/supabase";

function toUserFriendlySettingError(message: string) {
  const raw = message || "";
  if (raw.includes("duplicate key value violates unique constraint") || raw.includes("settings_tenant_id_namespace_key_key")) {
    return "This setting has already been saved for your account. You can update the existing record instead of creating a duplicate.";
  }

  if (raw.toLowerCase().includes("not signed in")) {
    return "Please sign in again to continue.";
  }

  if (raw.toLowerCase().includes("no profile found")) {
    return "Your account profile could not be loaded. Please refresh and try again.";
  }

  return raw || "Something went wrong while saving this setting.";
}

export async function getSetting<T>(namespace: string, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("settings").select("value").eq("namespace", namespace).eq("key", key).maybeSingle();
  return data ? (data.value as T) : fallback;
}

export async function upsertSetting(namespace: string, key: string, value: Record<string, unknown>) {
  // Requires the (tenant_id, namespace, key) unique constraint from
  // migration 0001 — this is what makes "modify everything" work as a
  // single reusable write path instead of one mutation per setting.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: { message: "Please sign in again to continue." } };

  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userData.user.id).single();
  if (!profile) return { error: { message: "Your account profile could not be loaded. Please refresh and try again." } };

  const { data, error } = await supabase
    .from("settings")
    .upsert({ tenant_id: profile.tenant_id, namespace, key, value }, { onConflict: "tenant_id,namespace,key" });

  if (error) {
    return { data: null, error: { message: toUserFriendlySettingError(error.message) } };
  }

  return { data, error: null };
}
