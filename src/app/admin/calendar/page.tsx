import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { CalendarToast } from "./CalendarToast";

/**
 * Staff-only Google Calendar connection page.
 *
 * Auth gate:
 *   - Must be signed in.
 *   - Must be tenant_member with role IN ('owner','admin','staff')
 *     for a tenant.
 *   - Must have a linked staff row (staff.user_id = auth.uid()) under
 *     that tenant.
 * Otherwise redirect to /portal.
 *
 * Renders different content for connected vs. not-connected states.
 * Apple-canon: cream background, Cormorant headings, Inter sub copy,
 * Card surface with hairline + shadow-2.
 */
export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    disconnected?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "staff"])
    .maybeSingle();
  if (!member) redirect("/portal");

  const { data: staff } = await supabase
    .from("staff")
    .select("id, display_name, tenant_id")
    .eq("user_id", user.id)
    .eq("tenant_id", member.tenant_id as string)
    .eq("is_active", true)
    .maybeSingle();

  const { data: integration } = staff
    ? await supabase
        .from("google_calendar_integrations")
        .select(
          "google_email, calendar_id, last_sync_at, is_active"
        )
        .eq("staff_id", staff.id as string)
        .maybeSingle()
    : { data: null };

  const isConnected = !!integration && integration.is_active === true;
  const lastSyncLabel = integration?.last_sync_at
    ? relativeOrDate(integration.last_sync_at as string)
    : "never";

  return (
    <div className="mx-auto min-h-screen w-full max-w-[640px] bg-cream px-6 pt-6 pb-12">
      <header className="flex items-baseline justify-between border-b-[0.5px] border-hairline pb-4">
        <p className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Astrabody · Staff
        </p>
        {staff && (
          <span className="text-[12px] tracking-snug text-olive-soft">
            {staff.display_name}
          </span>
        )}
      </header>

      <div className="mt-8">
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Your calendar
        </h1>
        <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
          Connect your Google Calendar so bookings land where you already
          work.
        </p>
      </div>

      {!staff ? (
        <Card className="mt-6 p-5">
          <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
            No staff record yet.
          </h3>
          <p className="mt-2 text-[13px] tracking-snug text-olive-soft">
            Ask Nigel to add you to the team. Once he links your account
            to a staff row, you&rsquo;ll be able to connect your calendar
            here.
          </p>
        </Card>
      ) : isConnected ? (
        <ConnectedCard
          email={integration!.google_email as string}
          calendarId={(integration!.calendar_id as string) ?? "primary"}
          lastSyncLabel={lastSyncLabel}
        />
      ) : (
        <NotConnectedCard />
      )}

      <CalendarToast
        connected={params.connected === "1"}
        disconnected={params.disconnected === "1"}
        error={params.error ?? null}
      />
    </div>
  );
}

function NotConnectedCard() {
  return (
    <Card className="mt-6 flex flex-col gap-3 p-5">
      <h3 className="font-serif text-[18px] font-medium tracking-tight text-olive">
        Not connected yet.
      </h3>
      <p className="text-[13px] tracking-snug text-olive-soft">
        We&rsquo;ll write Astrabody bookings to your Google Calendar and
        read your existing entries to keep slots accurate.
      </p>
      <Button variant="primary" size="default" asChild className="self-start">
        <Link href="/api/google/connect">Connect Google Calendar</Link>
      </Button>
    </Card>
  );
}

function ConnectedCard({
  email,
  calendarId,
  lastSyncLabel,
}: {
  email: string;
  calendarId: string;
  lastSyncLabel: string;
}) {
  return (
    <Card className="mt-6 flex flex-col gap-3 p-5">
      <span
        className="self-start rounded-full px-3 py-1 text-[12px] font-medium"
        style={{ background: "rgba(117,133,100,0.10)", color: "#5C6B4E" }}
      >
        Connected · {email}
      </span>
      <p className="text-[13px] tracking-snug text-olive-soft">
        Calendar: <span className="text-olive">{calendarId}</span> · Last
        synced {lastSyncLabel}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/api/google/connect">Re-authorise</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-olive-soft hover:text-destructive"
        >
          <Link href="/api/google/disconnect">Disconnect</Link>
        </Button>
      </div>
    </Card>
  );
}

function relativeOrDate(iso: string): string {
  const d = new Date(iso);
  if (differenceInDays(new Date(), d) < 7) {
    return formatDistanceToNow(d, { addSuffix: true });
  }
  return format(d, "d MMM");
}
