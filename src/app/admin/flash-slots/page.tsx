import { redirect } from "next/navigation";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { getActiveFlashSlotsAdmin, getFlashSuggestions } from "./queries-server";
import { FlashSlotsClient } from "./FlashSlotsClient";

export default async function FlashSlotsPage() {
  const ctx = await getAdminContextOrRedirect();
  if (!ctx.isOwnerOrAdmin) redirect("/admin");

  const [active, suggestions] = await Promise.all([
    getActiveFlashSlotsAdmin(ctx.tenantId),
    getFlashSuggestions(ctx.tenantId),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-serif text-[26px] font-medium tracking-tight text-olive">
          Flash Slots
        </h1>
        <p className="mt-1 text-[13px] text-olive-soft">
          Publish same-day discounted deals for empty slots. Clients see them
          instantly on the home screen.
        </p>
      </header>

      <FlashSlotsClient
        active={active}
        suggestions={suggestions}
      />
    </div>
  );
}
