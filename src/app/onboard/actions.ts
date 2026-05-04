"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normaliseHex, FONT_PAIRS } from "@/lib/tenant/brand-shared";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "atavo",
  "onboard",
  "onboarding",
  "support",
  "help",
  "billing",
  "internal",
  "auth",
  "login",
  "signup",
  "test",
]);

const ALLOWED_FONT_HEADINGS = new Set(FONT_PAIRS.map((p) => p.heading));
const ALLOWED_FONT_BODIES = new Set(FONT_PAIRS.map((p) => p.body));

/**
 * Verify the current user is an Atavo super-admin. Source of truth:
 * `app_metadata.is_atavo_admin === true` on the auth.users row,
 * settable via Supabase dashboard / a separate admin tool.
 */
export async function isAtavoAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  return meta.is_atavo_admin === true;
}

/**
 * Check slug availability + format. Used live as the operator types.
 */
export async function checkSlugAvailability(
  slug: string
): Promise<Result<{ available: boolean; reason?: string }>> {
  if (!(await isAtavoAdmin())) {
    return { ok: false, error: "atavo admin only" };
  }
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) return { ok: true, available: false, reason: "Empty" };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(trimmed)) {
    return {
      ok: true,
      available: false,
      reason: "Letters, numbers, hyphens only",
    };
  }
  if (RESERVED_SLUGS.has(trimmed)) {
    return { ok: true, available: false, reason: "Reserved" };
  }
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", trimmed)
    .maybeSingle();
  if (existing) {
    return { ok: true, available: false, reason: "Already taken" };
  }
  return { ok: true, available: true };
}

const SERVICE_TEMPLATES: Record<
  string,
  Array<{
    slug: string;
    name: string;
    description: string;
    duration_min: number;
    buffer_min: number;
    price_pence: number;
    deposit_pence: number;
    sort_order: number;
    is_bookable: boolean;
  }>
> = {
  wellness: [
    {
      slug: "infrabike",
      name: "InfraBike",
      description: "30-minute infrared cycling session.",
      duration_min: 30,
      buffer_min: 5,
      price_pence: 3900,
      deposit_pence: 1500,
      sort_order: 10,
      is_bookable: true,
    },
    {
      slug: "ems",
      name: "EMS Body Sculpting",
      description: "Electromagnetic muscle stimulation, 30 minutes.",
      duration_min: 30,
      buffer_min: 5,
      price_pence: 8000,
      deposit_pence: 2000,
      sort_order: 20,
      is_bookable: true,
    },
  ],
  aesthetics: [
    {
      slug: "fat-freezing-zone",
      name: "Fat Freezing — single zone",
      description: "M3Pro 360° cryolipolysis on one zone.",
      duration_min: 45,
      buffer_min: 15,
      price_pence: 16000,
      deposit_pence: 5000,
      sort_order: 10,
      is_bookable: true,
    },
    {
      slug: "laser-hair-removal",
      name: "Laser hair removal",
      description: "Diode 4-in-1, all skin types.",
      duration_min: 30,
      buffer_min: 10,
      price_pence: 9000,
      deposit_pence: 2000,
      sort_order: 20,
      is_bookable: true,
    },
  ],
  hair_beauty: [
    {
      slug: "haircut",
      name: "Cut + style",
      description: "Wash, cut, style.",
      duration_min: 60,
      buffer_min: 10,
      price_pence: 6500,
      deposit_pence: 0,
      sort_order: 10,
      is_bookable: true,
    },
    {
      slug: "colour",
      name: "Colour",
      description: "Full colour treatment.",
      duration_min: 120,
      buffer_min: 15,
      price_pence: 12000,
      deposit_pence: 3000,
      sort_order: 20,
      is_bookable: true,
    },
  ],
  custom: [],
};

const DEFAULT_HOURS = [
  { weekday: 1, start: "09:00", end: "18:00" }, // Mon
  { weekday: 2, start: "09:00", end: "18:00" },
  { weekday: 3, start: "09:00", end: "18:00" },
  { weekday: 4, start: "09:00", end: "18:00" },
  { weekday: 5, start: "09:00", end: "18:00" },
  { weekday: 6, start: "10:00", end: "16:00" },
  // Sunday closed
];

interface ProvisionInput {
  name: string;
  slug: string;
  ownerEmail: string;
  timezone: string;
  primaryHex: string;
  secondaryHex: string;
  backgroundHex: string;
  textHex: string;
  accentHex: string;
  fontHeading: string;
  fontBody: string;
  serviceTemplate: "wellness" | "aesthetics" | "hair_beauty" | "custom";
}

/**
 * Provision a fresh tenant in one transaction-ish flow:
 *   1. Insert tenants row
 *   2. Find or invite the owner via auth.admin.inviteUserByEmail
 *   3. Insert tenant_members row (role='owner') for that user
 *   4. Insert default services from the chosen template
 *   5. Insert default working hours
 *   6. Mark onboarding_completed_at
 *
 * Returns the new tenant's id + slug + the URL the operator should
 * hand to the owner (`<slug>.atavoplatform.com`).
 */
export async function provisionTenant(
  input: ProvisionInput
): Promise<
  Result<{ tenantId: string; slug: string; url: string }>
> {
  if (!(await isAtavoAdmin())) {
    return { ok: false, error: "atavo admin only" };
  }
  const slug = input.slug.trim().toLowerCase();
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "slug is reserved" };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return { ok: false, error: "slug format invalid" };
  }
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return { ok: false, error: "owner email invalid" };
  }
  const primaryHex = normaliseHex(input.primaryHex) ?? "#5C6B4E";
  const secondaryHex = normaliseHex(input.secondaryHex) ?? "#BBC4AA";
  const backgroundHex = normaliseHex(input.backgroundHex) ?? "#F6F3EE";
  const textHex = normaliseHex(input.textHex) ?? "#3E3E31";
  const accentHex = normaliseHex(input.accentHex) ?? "#758564";
  const fontHeading = ALLOWED_FONT_HEADINGS.has(input.fontHeading)
    ? input.fontHeading
    : "Cormorant Garamond";
  const fontBody = ALLOWED_FONT_BODIES.has(input.fontBody)
    ? input.fontBody
    : "Inter";
  const tz = input.timezone.trim() || "Europe/London";

  const admin = createAdminSupabase();

  // 1. Create the tenant.
  const { data: created, error: createErr } = await admin
    .from("tenants")
    .insert({
      slug,
      name: input.name.trim(),
      timezone: tz,
      brand_primary_hex: primaryHex,
      brand_secondary_hex: secondaryHex,
      brand_background_hex: backgroundHex,
      brand_text_hex: textHex,
      brand_accent_hex: accentHex,
      brand_font_heading: fontHeading,
      brand_font_body: fontBody,
      subdomain: slug,
      owner_email: ownerEmail,
      onboarding_completed_at: new Date().toISOString(),
    })
    .select("id, slug")
    .single();
  if (createErr || !created) {
    return { ok: false, error: createErr?.message ?? "couldn't create tenant" };
  }
  const tenantId = created.id as string;

  // 2. Find or invite the owner.
  let ownerUserId: string | null = null;
  try {
    const { data: lookup } = await admin.auth.admin.listUsers();
    const existing = lookup.users.find(
      (u) => (u.email ?? "").toLowerCase() === ownerEmail
    );
    if (existing) {
      ownerUserId = existing.id;
    } else {
      const { data: invite } = await admin.auth.admin.inviteUserByEmail(
        ownerEmail,
        {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://atavoplatform.com"}/admin`,
          data: { invited_for_tenant: slug },
        }
      );
      ownerUserId = invite?.user?.id ?? null;
    }
  } catch (e) {
    console.warn("[provisionTenant] owner invite failed:", e);
  }

  // 3. tenant_members link (owner) if we have a user id.
  if (ownerUserId) {
    await admin
      .from("tenant_members")
      .insert({ tenant_id: tenantId, user_id: ownerUserId, role: "owner" });
  }

  // 4. Default services from the chosen template.
  const services = SERVICE_TEMPLATES[input.serviceTemplate] ?? [];
  if (services.length > 0) {
    await admin.from("services").insert(
      services.map((s) => ({
        tenant_id: tenantId,
        slug: s.slug,
        name: s.name,
        description: s.description,
        duration_min: s.duration_min,
        buffer_min: s.buffer_min,
        price_pence: s.price_pence,
        deposit_pence: s.deposit_pence,
        sort_order: s.sort_order,
        is_bookable: s.is_bookable,
        is_active: true,
      }))
    );
  }

  // 5. Default working hours — leave staff-side empty for now since
  // we haven't created any staff yet. The owner sets these in
  // /admin/settings → Working hours after they sign in.

  // 6. Already marked onboarding_completed_at on insert above.

  const platformBase = process.env.NEXT_PUBLIC_APP_URL?.replace(
    /^https?:\/\//,
    ""
  ) ?? "atavoplatform.com";
  const url = `https://${slug}.${platformBase.replace(/^.*?([^./]+\.[^./]+(?:\.[^./]+)?)$/, "$1")}`;

  revalidatePath("/admin/settings");
  return {
    ok: true,
    tenantId,
    slug,
    url,
  };
}
