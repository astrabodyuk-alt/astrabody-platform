import "server-only";
import { renderEmail } from "@/lib/email/render";
import { sendOne } from "@/lib/email/resend";
import { createAdminSupabase } from "@/lib/supabase/admin";

interface GiftRecipientEmailInput {
  tenantId: string;
  giftCardId: string;
  code: string;
  amountPence: number;
  recipientName: string;
  recipientEmail: string;
  personalMessage: string | null;
  buyerName: string;
  expiresAt: string;
}

const RECIPIENT_SUBJECT_TEMPLATE =
  "{{buyer_name}} has sent you a gift from {{tenant_name}} 🌿";

const RECIPIENT_BODY_TEMPLATE = `# A gift for you

{{buyer_name}} has treated you to a session at **{{tenant_name}}**.

**Gift value: £{{amount}}**

Your code:

> ## {{code}}

{{message_block}}

This card is valid until **{{expiry}}**. Bring it (or just the code) when you book — you can use it across one or more sessions.

[Book your session →]({{book_url}})

— The {{tenant_name}} team
`;

const BUYER_SUBJECT_TEMPLATE =
  "Your gift to {{recipient_name}} is on its way";

const BUYER_BODY_TEMPLATE = `# Thank you

We've sent the gift to **{{recipient_name}}**. They'll receive it shortly with their unique code.

You'll only see one charge on your statement: £{{amount}} from {{tenant_name}}.

If they don't get it within a few minutes, ask them to check their junk folder. Anything off — just hit reply and we'll sort it.

— The {{tenant_name}} team
`;

export async function sendGiftCardRecipientEmail(
  input: GiftRecipientEmailInput
): Promise<void> {
  const admin = createAdminSupabase();
  const { data: tenant } = await admin
    .from("tenants")
    .select("name, custom_domain, subdomain, slug")
    .eq("id", input.tenantId)
    .maybeSingle();
  const tenantName = (tenant?.name as string | undefined) ?? "the studio";
  const bookUrl = buildPortalUrl(
    {
      custom_domain: tenant?.custom_domain as string | null | undefined,
      subdomain: tenant?.subdomain as string | null | undefined,
      slug: tenant?.slug as string | undefined,
    },
    "/portal/book"
  );

  const expiry = new Date(input.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const messageBlock = input.personalMessage
    ? `> _"${input.personalMessage.replace(/"/g, "")}"_\n`
    : "";

  const ctx = {
    tenant_name: tenantName,
    buyer_name: input.buyerName,
    recipient_name: input.recipientName,
    amount: (input.amountPence / 100).toFixed(0),
    code: input.code,
    expiry,
    book_url: bookUrl,
    message_block: messageBlock,
  };

  const rendered = await renderEmail(
    RECIPIENT_SUBJECT_TEMPLATE,
    RECIPIENT_BODY_TEMPLATE,
    ctx
  );
  await sendOne({
    tenantId: input.tenantId,
    templateId: null,
    clientId: null,
    toEmail: input.recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

interface BuyerEmailInput {
  tenantId: string;
  recipientName: string;
  amountPence: number;
  buyerEmail: string;
  buyerClientId: string | null;
}

export async function sendGiftCardBuyerEmail(
  input: BuyerEmailInput
): Promise<void> {
  const admin = createAdminSupabase();
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", input.tenantId)
    .maybeSingle();
  const tenantName = (tenant?.name as string | undefined) ?? "the studio";

  const ctx = {
    tenant_name: tenantName,
    recipient_name: input.recipientName,
    amount: (input.amountPence / 100).toFixed(0),
  };
  const rendered = await renderEmail(
    BUYER_SUBJECT_TEMPLATE,
    BUYER_BODY_TEMPLATE,
    ctx
  );
  await sendOne({
    tenantId: input.tenantId,
    templateId: null,
    clientId: input.buyerClientId,
    toEmail: input.buyerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

function buildPortalUrl(
  tenant: {
    custom_domain?: string | null;
    subdomain?: string | null;
    slug?: string | null;
  },
  path: string
): string {
  if (tenant.custom_domain) return `https://${tenant.custom_domain}${path}`;
  if (tenant.subdomain) return `https://${tenant.subdomain}.atavoplatform.com${path}`;
  if (tenant.slug) return `https://${tenant.slug}.atavoplatform.com${path}`;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
}
