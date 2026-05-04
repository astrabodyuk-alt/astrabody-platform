import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { getAdminContextOrRedirect } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { TenantConfigForm } from "./TenantConfigForm";
import { StaffList } from "./StaffList";
import { WorkingHoursEditor } from "./WorkingHoursEditor";
import { PacksList } from "./PacksList";
import { CancellationPolicyForm } from "./CancellationPolicyForm";
import { ReviewSettingsForm } from "./ReviewSettingsForm";
import {
  ServicesResourcesEditor,
  type ServiceWithResources,
} from "./ServicesResourcesEditor";
import { BrandingForm } from "./BrandingForm";
import { DomainForm } from "./DomainForm";
import {
  ScheduleEditor,
  type ClosureRow as ScheduleClosureRow,
  type StaffTimeOffRow as ScheduleStaffTimeOffRow,
  type StaffOption as ScheduleStaffOption,
  type ServiceOption as ScheduleServiceOption,
  type BankHolidayDecisionRow as ScheduleBankHolidayRow,
} from "./ScheduleEditor";
import { SettingsAssistantDrawer } from "./SettingsAssistantDrawer";
import { GiftCardsTab } from "./GiftCardsTab";
import { IntakeFormsTab } from "./IntakeFormsTab";
import { getCurrentTenantBrand } from "@/lib/tenant/brand";
import { ensureBankHolidayDecisions } from "@/lib/scheduling/bank-holiday-actions";
import type { GiftCardRow } from "@/lib/gift-cards/queries";
import type { IntakeFormRow } from "@/lib/forms/shared";

/**
 * /admin/settings — three tabs.
 *
 *   Tenant — name, brand colours, timezone (owner/admin write).
 *   Staff  — list + role switcher (owner only mutates).
 *   Hours  — per-staff working_hours editor.
 */
export default async function AdminSettingsPage() {
  const ctx = await getAdminContextOrRedirect();
  const supabase = await createServerSupabase();
  const brand = await getCurrentTenantBrand();

  const todayYmd = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/London",
  });
  const yearStart = `${todayYmd.slice(0, 4)}-01-01`;
  const yearEnd = `${todayYmd.slice(0, 4)}-12-31`;

  // Fire-and-forget — keeps the bank_holiday_decisions ledger up to date
  // for this tenant on every settings render. Cheap (one upsert).
  void ensureBankHolidayDecisions(ctx.tenantId).catch(() => {});

  const [
    tenantResult,
    staffResult,
    membersResult,
    hoursResult,
    servicesResult,
    packsResult,
    resourcesResult,
    closuresResult,
    timeOffResult,
    bankHolidaysResult,
    giftCardsResult,
    intakeFormsResult,
  ] =
    await Promise.all([
      supabase
        .from("tenants")
        .select(
          "name, brand_primary, brand_secondary, timezone, custom_domain, " +
            "cancellation_policy_enabled, noshow_charge_pct, late_cancel_charge_pct, " +
            "late_cancel_cutoff_hours, cancellation_policy_text, " +
            "google_business_review_url, review_bonus_voucher_pct, review_requests_paused, " +
            "reschedule_cutoff_hours"
        )
        .eq("id", ctx.tenantId)
        .maybeSingle(),
      supabase
        .from("staff")
        .select(
          "id, display_name, email, is_active, sort_order, user_id, photo_url, bio_short, specialties, commission_rate_pct"
        )
        .eq("tenant_id", ctx.tenantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tenant_members")
        .select("user_id, role")
        .eq("tenant_id", ctx.tenantId),
      supabase
        .from("working_hours")
        .select("staff_id, weekday, start_time, end_time")
        .eq("tenant_id", ctx.tenantId),
      supabase
        .from("services")
        .select("id, name, is_bookable")
        .eq("tenant_id", ctx.tenantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("service_packages")
        .select(
          "id, name, short_description, sessions_count, price_pence, " +
            "validity_months, is_active, sort_order, service_id, " +
            "services:service_id (name)"
        )
        .eq("tenant_id", ctx.tenantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("service_resources")
        .select("id, service_id, name, description, sort_order, is_active")
        .eq("tenant_id", ctx.tenantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tenant_closures")
        .select(
          "id, starts_on, ends_on, reason, is_all_day, partial_start, partial_end, service_id"
        )
        .eq("tenant_id", ctx.tenantId)
        .gte("ends_on", todayYmd)
        .order("starts_on", { ascending: true }),
      supabase
        .from("staff_time_off")
        .select(
          "id, staff_id, starts_on, ends_on, reason, is_all_day, partial_start, partial_end"
        )
        .eq("tenant_id", ctx.tenantId)
        .gte("ends_on", yearStart)
        .lte("starts_on", yearEnd)
        .order("starts_on", { ascending: true }),
      supabase
        .from("bank_holiday_decisions")
        .select("id, date, name, decision, client_email_sent_at")
        .eq("tenant_id", ctx.tenantId)
        .gte("date", todayYmd)
        .order("date", { ascending: true })
        .limit(12),
      supabase
        .from("gift_cards")
        .select(
          "id, tenant_id, code, initial_pence, balance_pence, purchased_by, recipient_email, recipient_name, personal_message, redeemed_by, redeemed_at, voided_at, expires_at, created_at"
        )
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("intake_forms")
        .select("id, tenant_id, name, service_ids, fields, is_active, created_at")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false }),
    ]);

  const tenant = (tenantResult.data ?? {
    name: "",
    brand_primary: "#758564",
    brand_secondary: "#F6F3EE",
    timezone: "Europe/London",
    custom_domain: null,
  }) as unknown as {
    name: string;
    brand_primary: string;
    brand_secondary: string;
    timezone: string;
    custom_domain: string | null;
    cancellation_policy_enabled: boolean | null;
    noshow_charge_pct: number | null;
    late_cancel_charge_pct: number | null;
    late_cancel_cutoff_hours: number | null;
    cancellation_policy_text: string | null;
    google_business_review_url: string | null;
    review_bonus_voucher_pct: number | null;
    review_requests_paused: boolean | null;
    reschedule_cutoff_hours: number | null;
  };

  const staffRows = (staffResult.data ?? []) as Array<{
    id: string;
    display_name: string;
    email: string | null;
    is_active: boolean;
    sort_order: number;
    user_id: string | null;
    photo_url: string | null;
    bio_short: string | null;
    specialties: string[] | null;
    commission_rate_pct: number | null;
  }>;
  const serviceRows = (servicesResult.data ?? []) as Array<{
    id: string;
    name: string;
    is_bookable: boolean;
  }>;
  const serviceNames = serviceRows
    .filter((s) => s.is_bookable)
    .map((s) => s.name)
    .filter(Boolean);
  const serviceOptionsForPacks = serviceRows.map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const packRows = ((packsResult.data ?? []) as unknown as Array<{
    id: string;
    name: string;
    short_description: string | null;
    sessions_count: number;
    price_pence: number;
    validity_months: number;
    is_active: boolean;
    sort_order: number;
    service_id: string;
    services: { name: string } | { name: string }[] | null;
  }>).map((p) => {
    const svc = Array.isArray(p.services) ? p.services[0] : p.services;
    return {
      id: p.id,
      name: p.name,
      short_description: p.short_description,
      sessions_count: p.sessions_count,
      price_pence: p.price_pence,
      validity_months: p.validity_months,
      is_active: p.is_active,
      sort_order: p.sort_order,
      service_id: p.service_id,
      service_name: svc?.name ?? "",
    };
  });
  const resourceRows = (resourcesResult.data ?? []) as Array<{
    id: string;
    service_id: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }>;

  const servicesWithResources: ServiceWithResources[] = serviceRows
    .filter((s) => s.is_bookable)
    .map((s) => ({
      id: s.id,
      name: s.name,
      resources: resourceRows
        .filter((r) => r.service_id === s.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }));

  const memberRows = (membersResult.data ?? []) as Array<{
    user_id: string;
    role: string;
  }>;
  const hoursRows = (hoursResult.data ?? []) as Array<{
    staff_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
  }>;

  // Hydrate a role onto each staff row by user_id match.
  const memberByUser = new Map(memberRows.map((m) => [m.user_id, m.role]));
  const staffWithRoles = staffRows.map((s) => ({
    ...s,
    role: s.user_id ? memberByUser.get(s.user_id) ?? null : null,
  }));

  // Group hours by staff for the editor.
  const hoursByStaff = new Map<
    string,
    Array<{ weekday: number; start: string; end: string }>
  >();
  for (const h of hoursRows) {
    const arr = hoursByStaff.get(h.staff_id) ?? [];
    arr.push({
      weekday: h.weekday,
      start: h.start_time.slice(0, 5),
      end: h.end_time.slice(0, 5),
    });
    hoursByStaff.set(h.staff_id, arr);
  }

  // -------- Schedule tab data --------
  const closureRows = (closuresResult.data ?? []) as Array<{
    id: string;
    starts_on: string;
    ends_on: string;
    reason: string | null;
    is_all_day: boolean;
    partial_start: string | null;
    partial_end: string | null;
    service_id: string | null;
  }>;
  const timeOffRows = (timeOffResult.data ?? []) as Array<{
    id: string;
    staff_id: string;
    starts_on: string;
    ends_on: string;
    reason: string | null;
    is_all_day: boolean;
    partial_start: string | null;
    partial_end: string | null;
  }>;
  const serviceById = new Map(serviceRows.map((s) => [s.id, s.name]));

  // Affected booking counts per closure (only fetch where overlap is
  // possible). Owner gets a soft warning surfaced in the row.
  let affectedByClosure = new Map<string, number>();
  if (closureRows.length > 0) {
    const minStart = closureRows.reduce(
      (acc, c) => (c.starts_on < acc ? c.starts_on : acc),
      closureRows[0].starts_on
    );
    const maxEnd = closureRows.reduce(
      (acc, c) => (c.ends_on > acc ? c.ends_on : acc),
      closureRows[0].ends_on
    );
    const { data: bookingsInWindow } = await supabase
      .from("bookings")
      .select("id, starts_at, service_id")
      .eq("tenant_id", ctx.tenantId)
      .gte("starts_at", `${minStart}T00:00:00`)
      .lte("starts_at", `${maxEnd}T23:59:59.999`)
      .in("status", ["pending", "confirmed"]);
    const bookings = (bookingsInWindow ?? []) as Array<{
      starts_at: string;
      service_id: string | null;
    }>;
    affectedByClosure = closureRows.reduce((acc, c) => {
      const count = bookings.reduce((n, b) => {
        const ymd = b.starts_at.slice(0, 10);
        if (ymd < c.starts_on || ymd > c.ends_on) return n;
        if (c.service_id && b.service_id !== c.service_id) return n;
        return n + 1;
      }, 0);
      acc.set(c.id, count);
      return acc;
    }, new Map<string, number>());
  }

  const scheduleClosures: ScheduleClosureRow[] = closureRows.map((c) => ({
    id: c.id,
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    reason: c.reason,
    is_all_day: c.is_all_day,
    partial_start: c.partial_start,
    partial_end: c.partial_end,
    service_id: c.service_id,
    service_name: c.service_id ? serviceById.get(c.service_id) ?? null : null,
    affected_bookings: affectedByClosure.get(c.id) ?? 0,
  }));

  const scheduleTimeOff: ScheduleStaffTimeOffRow[] = timeOffRows.map((t) => ({
    id: t.id,
    staff_id: t.staff_id,
    starts_on: t.starts_on,
    ends_on: t.ends_on,
    reason: t.reason,
    is_all_day: t.is_all_day,
    partial_start: t.partial_start,
    partial_end: t.partial_end,
  }));

  const daysOffByStaff = timeOffRows.reduce((acc, t) => {
    const start = new Date(`${t.starts_on}T00:00:00`).getTime();
    const end = new Date(`${t.ends_on}T00:00:00`).getTime();
    const days = Math.floor((end - start) / 86_400_000) + 1;
    if (t.is_all_day) {
      acc.set(t.staff_id, (acc.get(t.staff_id) ?? 0) + days);
    }
    return acc;
  }, new Map<string, number>());

  const scheduleStaff: ScheduleStaffOption[] = staffWithRoles
    .filter((s) => s.is_active)
    .map((s) => ({
      id: s.id,
      display_name: s.display_name,
      role: s.role,
      days_off_year: daysOffByStaff.get(s.id) ?? 0,
    }));

  const scheduleServices: ScheduleServiceOption[] = serviceRows
    .filter((s) => s.is_bookable)
    .map((s) => ({ id: s.id, name: s.name }));

  const scheduleBankHolidays: ScheduleBankHolidayRow[] = (
    (bankHolidaysResult.data ?? []) as Array<{
      id: string;
      date: string;
      name: string;
      decision: "pending" | "closed" | "open";
      client_email_sent_at: string | null;
    }>
  ).map((b) => ({
    id: b.id,
    date: b.date,
    name: b.name,
    decision: b.decision,
    client_email_sent_at: b.client_email_sent_at,
  }));

  const giftCards = (giftCardsResult.data ?? []) as unknown as GiftCardRow[];
  const intakeForms = (intakeFormsResult.data ?? []) as unknown as IntakeFormRow[];

  // -------- AI assistant context (read-only snapshot) --------
  const aiContext = {
    tenantName: brand.name,
    timezone: (tenant.timezone as string | undefined) ?? "Europe/London",
    workingHours: hoursRows.map((h) => ({
      staff_id: h.staff_id,
      weekday: h.weekday,
      start: h.start_time.slice(0, 5),
      end: h.end_time.slice(0, 5),
    })),
    staff: staffWithRoles.map((s) => ({
      id: s.id,
      name: s.display_name,
      role: s.role,
      commission_rate_pct: s.commission_rate_pct,
    })),
    services: serviceRows.map((s) => ({
      id: s.id,
      name: s.name,
    })),
    closures: closureRows.map((c) => ({
      id: c.id,
      starts_on: c.starts_on,
      ends_on: c.ends_on,
      reason: c.reason,
      service_name: c.service_id ? serviceById.get(c.service_id) ?? null : null,
    })),
    staffTimeOff: timeOffRows.map((t) => ({
      id: t.id,
      staff_id: t.staff_id,
      staff_name:
        staffWithRoles.find((s) => s.id === t.staff_id)?.display_name ??
        "Unknown",
      starts_on: t.starts_on,
      ends_on: t.ends_on,
      reason: t.reason,
    })),
    cancellationPolicy: {
      enabled: (tenant.cancellation_policy_enabled as boolean | undefined) ?? true,
      noshow_charge_pct:
        (tenant.noshow_charge_pct as number | undefined) ?? 100,
      late_cancel_charge_pct:
        (tenant.late_cancel_charge_pct as number | undefined) ?? 50,
      late_cancel_cutoff_hours:
        (tenant.late_cancel_cutoff_hours as number | undefined) ?? 24,
      custom_text:
        (tenant.cancellation_policy_text as string | null | undefined) ?? null,
    },
    reviewSettings: {
      google_business_review_url:
        (tenant.google_business_review_url as string | null | undefined) ?? null,
      review_bonus_voucher_pct:
        (tenant.review_bonus_voucher_pct as number | undefined) ?? 15,
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight text-olive">
          Settings
        </h1>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Tenant config, team, and availability.
        </p>
      </header>

      <Tabs defaultValue="tenant">
        <TabsList>
          <TabsTrigger value="tenant">Studio</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="packs">Packs</TabsTrigger>
          <TabsTrigger value="hours">Working hours</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="policy">Cancellation policy</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="domain">Domain</TabsTrigger>
          <TabsTrigger value="gift-cards">Gift cards</TabsTrigger>
          <TabsTrigger value="intake-forms">Intake forms</TabsTrigger>
        </TabsList>

        <TabsContent value="tenant">
          <Card className="p-5">
            <TenantConfigForm
              initial={{
                name: tenant.name as string,
                brand_primary: (tenant.brand_primary as string) ?? "#758564",
                brand_secondary: (tenant.brand_secondary as string) ?? "#F6F3EE",
                timezone: (tenant.timezone as string) ?? "Europe/London",
              }}
              readOnly={!ctx.isOwnerOrAdmin}
            />
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card className="overflow-hidden p-0">
            <StaffList
              staff={staffWithRoles}
              isOwner={ctx.role === "owner"}
              isOwnerOrAdmin={ctx.isOwnerOrAdmin}
              currentStaffId={ctx.staffId}
              serviceNames={serviceNames}
            />
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <WorkingHoursEditor
            staff={staffWithRoles.filter((s) => s.is_active)}
            hoursByStaff={Object.fromEntries(hoursByStaff.entries())}
            currentStaffId={ctx.staffId}
            isOwnerOrAdmin={ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="services">
          <ServicesResourcesEditor
            services={servicesWithResources}
            initialCutoffHours={
              (tenant as unknown as { reschedule_cutoff_hours?: number })
                .reschedule_cutoff_hours ?? 1
            }
            readOnly={!ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="packs">
          <div className="flex flex-col gap-4">
            <PacksList
              packs={packRows}
              services={serviceOptionsForPacks}
              isOwner={ctx.role === "owner"}
            />
          </div>
        </TabsContent>

        <TabsContent value="reviews">
          <ReviewSettingsForm
            initial={{
              googleBusinessReviewUrl:
                (tenant.google_business_review_url as string | null | undefined) ??
                null,
              reviewBonusVoucherPct:
                (tenant.review_bonus_voucher_pct as number | undefined) ?? 15,
              reviewRequestsPaused:
                (tenant.review_requests_paused as boolean | undefined) ?? false,
            }}
            readOnly={!ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="policy">
          <CancellationPolicyForm
            initial={{
              enabled:
                (tenant.cancellation_policy_enabled as boolean | undefined) ??
                true,
              noshowChargePct:
                (tenant.noshow_charge_pct as number | undefined) ?? 100,
              lateCancelChargePct:
                (tenant.late_cancel_charge_pct as number | undefined) ?? 50,
              lateCancelCutoffHours:
                (tenant.late_cancel_cutoff_hours as number | undefined) ?? 24,
              customText:
                (tenant.cancellation_policy_text as string | null | undefined) ??
                null,
            }}
            readOnly={!ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingForm
            initial={{
              logoUrl: brand.logoUrl,
              primaryHex: brand.primaryHex,
              secondaryHex: brand.secondaryHex,
              backgroundHex: brand.backgroundHex,
              textHex: brand.textHex,
              accentHex: brand.accentHex,
              fontHeading: brand.fontHeading,
              fontBody: brand.fontBody,
            }}
            tenantName={brand.name}
            readOnly={!ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="domain">
          <DomainForm
            initial={{
              slug: brand.slug,
              subdomain: brand.subdomain,
              customDomain: brand.customDomain,
            }}
            readOnly={!ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="gift-cards">
          <GiftCardsTab
            cards={giftCards}
            isOwner={ctx.role === "owner"}
            isOwnerOrAdmin={ctx.isOwnerOrAdmin}
          />
        </TabsContent>

        <TabsContent value="intake-forms">
          <IntakeFormsTab
            forms={intakeForms}
            services={scheduleServices}
          />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleEditor
            closures={scheduleClosures}
            timeOff={scheduleTimeOff}
            staff={scheduleStaff}
            services={scheduleServices}
            bankHolidays={scheduleBankHolidays}
            isOwnerOrAdmin={ctx.isOwnerOrAdmin}
            currentStaffId={ctx.staffId}
          />
        </TabsContent>
      </Tabs>

      {ctx.isOwnerOrAdmin && (
        <SettingsAssistantDrawer context={aiContext} />
      )}
    </div>
  );
}
