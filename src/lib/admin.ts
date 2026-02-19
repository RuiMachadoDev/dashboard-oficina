import { supabase } from "./supabase";

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("admins check failed:", error);
    return false;
  }
  
  return !!data?.user_id;
}
