import { supabase } from "./supabase";

export async function uploadFinanceAttachment(file: File, recordType: "expense" | "maintenance", recordId: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userData.user.id).single();
  if (!profile) throw new Error("No profile found");
  const extension = file.name.split(".").pop() || "jpg";
  const path = `${profile.tenant_id}/${recordType}/${recordId}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("finance-attachments").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  return path;
}

export async function openFinanceAttachment(path: string | null) {
  if (!path) return;
  const { data, error } = await supabase.storage.from("finance-attachments").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
