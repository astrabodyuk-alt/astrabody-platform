import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ShopClient } from "./ShopClient";

export default async function ShopPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login?next=/portal/shop");
  return <ShopClient />;
}
