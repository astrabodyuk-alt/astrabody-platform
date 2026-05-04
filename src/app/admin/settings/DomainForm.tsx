"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateTenantCustomDomain } from "@/lib/tenant/branding-actions";

interface DomainShape {
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
}

const PLATFORM_HOST = "atavoplatform.com";

/**
 * Domain settings tab. Read-only view of the platform subdomain
 * (`<slug>.atavoplatform.com`) and an editable custom-domain field.
 *
 * DNS verification + Vercel API binding is post-deploy infrastructure
 * (TODO at the bottom). For now we record the value and show the DNS
 * instructions so the operator can prep their DNS in advance.
 */
export function DomainForm({
  initial,
  readOnly,
}: {
  initial: DomainShape;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [custom, setCustom] = useState(initial.customDomain ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subdomain = initial.subdomain ?? initial.slug;
  const platformUrl = `${subdomain}.${PLATFORM_HOST}`;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await updateTenantCustomDomain(custom || null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="font-serif text-[20px] font-medium tracking-tight text-olive">
          Platform subdomain
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Always available, always works. No DNS setup required.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/40 px-3 py-2">
          <span className="font-mono text-[13px] tracking-snug text-olive">
            https://{platformUrl}
          </span>
          <span className="rounded-full bg-sage/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-label-caps text-sage-deep">
            live
          </span>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-serif text-[20px] font-medium tracking-tight text-olive">
          Custom domain
        </h2>
        <p className="mt-1 text-[13px] tracking-snug text-olive-soft">
          Use your own domain (e.g. <span className="font-mono">app.your-studio.com</span>).
          Optional. The platform works identically on either URL.
        </p>

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Custom domain
          </span>
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value.toLowerCase())}
            placeholder="app.your-studio.com"
            disabled={readOnly}
            className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 font-mono text-[13px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
          />
        </label>

        {custom && (
          <div className="mt-4 rounded-[12px] border-[0.5px] border-hairline bg-cream-deep/40 p-3">
            <p className="text-[12px] font-medium uppercase tracking-label-caps text-olive-soft">
              DNS setup
            </p>
            <ol className="mt-2 flex flex-col gap-2 text-[13px] tracking-snug text-olive">
              <li>
                1. In your DNS provider, add a CNAME record for{" "}
                <span className="font-mono">{custom}</span> pointing to{" "}
                <span className="font-mono">cname.{PLATFORM_HOST}</span>.
              </li>
              <li>
                2. Save these settings. The platform will verify within an
                hour and email you when the domain is live.
              </li>
              <li>
                3. While verifying, your existing{" "}
                <span className="font-mono">{platformUrl}</span> URL keeps
                working.
              </li>
            </ol>
          </div>
        )}

        {error && (
          <p className="mt-3 text-[12px] text-destructive">{error}</p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={readOnly || pending || (custom ?? "") === (initial.customDomain ?? "")}
          >
            {pending ? "Saving" : "Save"}
          </Button>
          {savedAt && !pending && (
            <span className="text-[12px] tracking-snug text-sage-deep">
              Saved ✓
            </span>
          )}
        </div>

        {/* TODO(post-deploy): wire Vercel API for automatic CNAME
            verification. Use VERCEL_TOKEN + VERCEL_TEAM_ID; project id
            is the deployment's. Until then, verification is manual. */}
      </Card>
    </div>
  );
}
