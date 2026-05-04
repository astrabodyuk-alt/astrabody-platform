"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatPoints } from "@/lib/utils";
import { giftFriendTrial } from "./actions";

/**
 * Inline "Gift a friend" panel on /portal/me.
 * Visible only when the client has at least 4 000 pts; otherwise the
 * page hides this section entirely (per design DNA: absence > noise).
 *
 * Shares the giftFriendTrial server action with the RewardsGrid's
 * gift-friend-session reward dialog.
 */
export function GiftFriendPanel({ costPoints }: { costPoints: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Auto-collapse the success state after 3 seconds, per spec.
  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => {
      setSent(false);
      router.refresh();
    }, 3000);
    return () => clearTimeout(id);
  }, [sent, router]);

  if (sent) {
    return (
      <Card className="p-5">
        <h3 className="font-serif text-[22px] font-medium tracking-tight text-olive">
          Sent ✨
        </h3>
        <p className="mt-2 text-[13px] tracking-snug text-olive-soft">
          You&rsquo;ll earn +200 pts when she shows up for her trial.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="font-serif text-[22px] font-medium tracking-tight text-olive">
        Gift a friend a free trial.
      </h3>
      <p className="mt-2 text-[13px] tracking-snug text-olive-soft">
        Choose someone who&rsquo;d love Astrabody. We&rsquo;ll send her a free
        InfraBike trial in your name. You earn +200 pts when she shows up.
      </p>

      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          const result = await giftFriendTrial({
            friendName: name,
            friendPhone: phone,
            friendEmail: email || undefined,
            message: msg || undefined,
          });
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          setPhone("");
          setEmail("");
          setMsg("");
          setSent(true);
        }}
      >
        <Field
          label="Friend's name"
          value={name}
          onChange={setName}
          placeholder="Sarah"
          autoComplete="off"
        />
        <Field
          label="Phone"
          value={phone}
          onChange={setPhone}
          placeholder="+44 7…"
          inputMode="tel"
          autoComplete="off"
        />
        <Field
          label="Email (optional)"
          value={email}
          onChange={setEmail}
          placeholder="sarah@example.com"
          inputMode="email"
          autoComplete="off"
          type="email"
        />
        <Field
          label="Short message (optional)"
          value={msg}
          onChange={(v) => setMsg(v.slice(0, 200))}
          placeholder="Try this place I love"
        />
        <p className="text-[11px] tracking-snug text-olive-faint">
          Cost: {formatPoints(costPoints)} pts.
        </p>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !name.trim() || !phone.trim()}
          className="self-start"
        >
          {busy ? "Sending" : "Send the gift"}
        </Button>
        {error && (
          <p className="text-[12px] text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint disabled:opacity-50"
        )}
        {...rest}
      />
    </label>
  );
}
