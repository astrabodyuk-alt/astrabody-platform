import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { PaymentMethodSection } from "./PaymentMethodSection";

/**
 * /portal/account — client-side account settings. V1 surfaces the
 * saved-card management section. Future sections (notifications,
 * GDPR data export, marketing consent) will land in later prompts.
 */
export default async function PortalAccountPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const admin = createAdminSupabase();
  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!link) redirect("/portal/login");
  const clientId = link.client_id as string;

  const { data: clientRaw } = await admin
    .from("clients")
    .select(
      "id, full_name, email, " +
        "default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, saved_card_at"
    )
    .eq("id", clientId)
    .maybeSingle();
  const client = clientRaw as unknown as {
    id: string;
    full_name: string | null;
    email: string | null;
    default_payment_method_id: string | null;
    card_brand: string | null;
    card_last4: string | null;
    card_exp_month: number | null;
    card_exp_year: number | null;
    saved_card_at: string | null;
  } | null;

  if (!client) redirect("/portal/login");

  const savedCard = client.default_payment_method_id
    ? {
        brand: (client.card_brand as string | null) ?? "card",
        last4: (client.card_last4 as string | null) ?? "••••",
        expMonth: (client.card_exp_month as number | null) ?? 0,
        expYear: (client.card_exp_year as number | null) ?? 0,
        savedAt: (client.saved_card_at as string | null) ?? null,
      }
    : null;

  return (
    <div className="px-4 pt-4 pb-32">
      <header className="mb-4 px-2 py-3">
        <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-olive">
          Account
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          {(client.full_name as string | null) ?? client.email ?? ""}
        </p>
      </header>

      <section className="mt-4">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Payment method
        </h2>
        <Card className="p-5">
          <PaymentMethodSection savedCard={savedCard} />
        </Card>
      </section>
    </div>
  );
}
