import { supabase } from "@/services/supabase";

export async function fetchProgramCodes(): Promise<string[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured; program codes could not be loaded.");
  }

  const { data, error } = await supabase
    .from("programs")
    .select("code")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Could not load program codes: ${error.message}`);
  }

  return (data ?? [])
    .map((program) => program.code?.trim().toUpperCase())
    .filter((code): code is string => Boolean(code));
}

