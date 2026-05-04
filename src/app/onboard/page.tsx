import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAtavoAdmin } from "./actions";
import { OnboardWizard } from "./OnboardWizard";

/**
 * /onboard — Atavo super-admin only. Five-step wizard to provision a
 * new tenant in about 5 minutes:
 *
 *   1. Studio basics (name, slug, owner email, timezone)
 *   2. Branding (logo upload optional, palette, fonts) with live preview
 *   3. Services (pre-set template chosen from 4 categories)
 *   4. Working hours (defaults editable later in /admin/settings)
 *   5. Done — show the new tenant's URL + that the owner has been emailed
 *
 * Provisioning happens in one server action call at step 5; earlier
 * steps just collect form state in client memory. (Resumable drafts
 * could be added later by saving to a `tenant_drafts` table — out of
 * scope for V1.)
 */
export default async function OnboardPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login?next=/onboard");
  const allowed = await isAtavoAdmin();
  if (!allowed) {
    return (
      <div className="mx-auto max-w-[480px] px-6 py-16">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Restricted
        </h1>
        <p className="mt-3 text-[14px] tracking-snug text-olive-soft">
          /onboard is for Atavo platform admins. If you should have access,
          ask Nigel to set <span className="font-mono">is_atavo_admin = true</span>{" "}
          on your auth row.
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-cream px-6 py-12">
      <div className="mx-auto max-w-[1080px]">
        <header className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Atavo · Onboarding
          </p>
          <h1 className="mt-1 font-serif text-[32px] font-medium leading-tight tracking-tightest text-olive">
            Spin up a new studio
          </h1>
          <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
            Five steps. Five minutes. Owner gets an invite email at the end.
          </p>
        </header>
        <OnboardWizard />
      </div>
    </div>
  );
}
