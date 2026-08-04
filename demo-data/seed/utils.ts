import { PostgrestError } from "@supabase/supabase-js";

export function throwIfError(error: PostgrestError | null) {
  if (error) {
    console.error(error);
    throw error;
  }
}