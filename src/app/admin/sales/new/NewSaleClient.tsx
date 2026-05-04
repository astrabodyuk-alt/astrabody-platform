"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatGBP } from "@/lib/utils";
import { createWalkinClient, createPackageSale } from "../actions";
import { searchClientsForSale } from "./actions";

export interface PackOption {
  id: string;
  name: string;
  short_description: string | null;
  sessions_count: number;
  price_pence: number;
  validity_months: number;
  service_name: string;
}

export interface StaffOption {
  id: string;
  display_name: string;
}

interface ClientLite {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

type Step = 1 | 2 | 3;
type Method =
  | "cash"
  | "card_terminal"
  | "bank_transfer"
  | "stripe_online"
  | "gift"
  | "other";

const METHODS: Array<{ id: Method; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "card_terminal", label: "Card terminal" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "stripe_online", label: "Stripe online" },
  { id: "gift", label: "Gift" },
  { id: "other", label: "Other" },
];

export function NewSaleClient({
  packs,
  staff,
  defaultStaffId,
  canPickAnyStaff,
  initialClient,
}: {
  packs: PackOption[];
  staff: StaffOption[];
  defaultStaffId: string | null;
  canPickAnyStaff: boolean;
  initialClient: ClientLite | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialClient ? 2 : 1);
  const [client, setClient] = useState<ClientLite | null>(initialClient);
  const [pack, setPack] = useState<PackOption | null>(null);
  const [soldByStaffId, setSoldByStaffId] = useState<string>(
    defaultStaffId ?? staff[0]?.id ?? ""
  );
  const [method, setMethod] = useState<Method>("card_terminal");
  const [amountPounds, setAmountPounds] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    soldByName: string;
    commissionPence: number;
    clientFirstName: string;
  } | null>(null);

  // Re-default amount whenever the pack changes.
  useEffect(() => {
    if (pack) {
      setAmountPounds((pack.price_pence / 100).toFixed(2));
    }
  }, [pack]);

  function handleSubmit() {
    if (!client || !pack) return;
    setError(null);
    const pounds = Number(amountPounds);
    if (!Number.isFinite(pounds) || pounds < 0) {
      setError("Amount must be a number");
      return;
    }
    const amountPence = Math.round(pounds * 100);
    startTransition(async () => {
      const r = await createPackageSale({
        clientId: client.id,
        packageId: pack.id,
        soldByStaffId,
        amountPaidPence: amountPence,
        paymentMethod: method,
        reference,
        notes,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const soldByName =
        staff.find((s) => s.id === soldByStaffId)?.display_name ?? "Staff";
      const firstName = (client.full_name ?? "").trim().split(/\s+/)[0] || "the client";
      setConfirmed({
        soldByName,
        commissionPence: r.commissionPence,
        clientFirstName: firstName,
      });
    });
  }

  if (confirmed) {
    return (
      <Card className="p-6">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-sage-deep">
          Sale recorded
        </p>
        <p className="mt-3 font-serif text-[22px] font-medium leading-snug tracking-tight text-olive">
          Pack credited to {confirmed.clientFirstName}&rsquo;s account.
        </p>
        <p className="mt-2 text-[14px] tracking-snug text-olive-soft">
          {confirmed.soldByName} earns {formatGBP(confirmed.commissionPence)}{" "}
          commission.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => router.push("/admin/sales")}
          >
            Back to sales
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirmed(null);
              setClient(null);
              setPack(null);
              setStep(1);
              setReference("");
              setNotes("");
              router.refresh();
            }}
          >
            Record another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Stepper step={step} hasInitialClient={!!initialClient} />

      {step === 1 && (
        <ClientStep
          onPick={(c) => {
            setClient(c);
            setStep(2);
          }}
        />
      )}
      {step === 2 && client && (
        <PackStep
          packs={packs}
          client={client}
          onBack={() => (initialClient ? null : setStep(1))}
          canGoBack={!initialClient}
          onPick={(p) => {
            setPack(p);
            setStep(3);
          }}
        />
      )}
      {step === 3 && client && pack && (
        <ConfirmStep
          pack={pack}
          client={client}
          staff={staff}
          soldByStaffId={soldByStaffId}
          canPickAnyStaff={canPickAnyStaff}
          onChangeSoldBy={setSoldByStaffId}
          method={method}
          onChangeMethod={setMethod}
          amountPounds={amountPounds}
          onChangeAmount={setAmountPounds}
          reference={reference}
          onChangeReference={setReference}
          notes={notes}
          onChangeNotes={setNotes}
          pending={pending}
          error={error}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

function Stepper({
  step,
  hasInitialClient,
}: {
  step: Step;
  hasInitialClient: boolean;
}) {
  const labels = ["Client", "Pack", "Confirm"];
  return (
    <div className="sticky top-[60px] z-10 -mx-2 bg-cream/85 px-2 py-2 backdrop-blur-md">
      <div className="flex items-center gap-2">
        {labels.map((label, i) => {
          const idx = (i + 1) as Step;
          const isCurrent = idx === step;
          const isDone = idx < step || (idx === 1 && hasInitialClient);
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums",
                  isCurrent
                    ? "bg-sage text-cream"
                    : isDone
                      ? "bg-sage-deep text-cream"
                      : "bg-cream-deep text-olive-soft"
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {idx}
              </div>
              <span
                className={cn(
                  "text-[12px] font-medium tracking-snug",
                  isCurrent ? "text-olive" : "text-olive-soft"
                )}
              >
                {label}
              </span>
              {i < 2 && (
                <div
                  className={cn(
                    "ml-1 h-px flex-1",
                    idx < step ? "bg-sage-deep" : "bg-hairline"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClientStep({ onPick }: { onPick: (c: ClientLite) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [walkinOpen, setWalkinOpen] = useState(false);

  // Debounced server search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const r = await searchClientsForSale(q);
      if (r.ok) setResults(r.results);
      setSearching(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="flex flex-col gap-4">
      {!walkinOpen && (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search name, email or phone"
            className="h-12 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-4 text-[15px] text-olive shadow-1 placeholder:text-olive-faint"
          />
          {query.trim().length >= 2 && (
            <ul className="flex flex-col gap-2">
              {results.map((c) => (
                <li key={c.id}>
                  <Card
                    interactive
                    role="button"
                    tabIndex={0}
                    onClick={() => onPick(c)}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-[14px] font-medium tracking-snug text-olive">
                        {c.full_name ?? c.email ?? c.phone ?? "Unnamed"}
                      </span>
                      <span className="text-[12px] tracking-snug text-olive-soft">
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
              {!searching && results.length === 0 && (
                <Card className="p-3">
                  <p className="text-[12px] tracking-snug text-olive-soft">
                    No matches. Hit &ldquo;New client&rdquo; to add a walk-in.
                  </p>
                </Card>
              )}
            </ul>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setWalkinOpen(true)}
            className="self-start text-sage-deep"
          >
            + New client
          </Button>
        </>
      )}
      {walkinOpen && <WalkinForm onCreated={onPick} onCancel={() => setWalkinOpen(false)} />}
    </div>
  );
}

function WalkinForm({
  onCreated,
  onCancel,
}: {
  onCreated: (c: ClientLite) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const r = await createWalkinClient({
        fullName,
        email: email || null,
        phone: phone || null,
        marketingConsent: marketing,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCreated({ id: r.clientId, full_name: fullName, email, phone });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Full name" required>
        <input
          type="text"
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
        />
      </Field>
      <Field label="Email (optional)">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="They can fill it in later"
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
        />
      </Field>
      <Field label="Phone (optional)">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1"
        />
      </Field>
      <label className="flex items-center gap-2 text-[13px] tracking-snug text-olive">
        <input
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
          className="h-4 w-4 accent-sage"
        />
        Happy to receive marketing
      </label>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={pending || !fullName.trim()}
        >
          {pending ? "Creating" : "Create client"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-olive-soft"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PackStep({
  packs,
  client,
  onBack,
  canGoBack,
  onPick,
}: {
  packs: PackOption[];
  client: ClientLite;
  onBack: () => void;
  canGoBack: boolean;
  onPick: (p: PackOption) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-cream-deep p-3">
        <p className="text-[12px] tracking-snug text-olive-soft">For</p>
        <p className="mt-0.5 text-[14px] font-medium tracking-snug text-olive">
          {client.full_name ?? client.email ?? client.phone ?? "Client"}
        </p>
      </Card>
      <ul className="flex flex-col gap-2">
        {packs.map((p) => {
          const perSession = Math.round(p.price_pence / p.sessions_count);
          return (
            <li key={p.id}>
              <Card
                interactive
                role="button"
                tabIndex={0}
                onClick={() => onPick(p)}
                className="p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-medium tracking-snug text-olive">
                      {p.name}
                    </p>
                    {p.short_description && (
                      <p className="mt-0.5 text-[12px] tracking-snug text-olive-soft">
                        {p.short_description}
                      </p>
                    )}
                  </div>
                  <span className="font-serif text-[20px] font-medium tabular-nums text-sage-deep">
                    {formatGBP(p.price_pence)}
                  </span>
                </div>
                <p className="mt-2 text-[11px] uppercase tracking-label-caps text-olive-soft">
                  {p.sessions_count} sessions &middot; {formatGBP(perSession)} per session &middot; valid {p.validity_months} months
                </p>
              </Card>
            </li>
          );
        })}
        {packs.length === 0 && (
          <Card className="p-4">
            <p className="text-[13px] tracking-snug text-olive-soft">
              No active packs in the catalogue. Add one in Settings → Packs.
            </p>
          </Card>
        )}
      </ul>
      {canGoBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="self-start text-olive-soft"
        >
          ← Change client
        </Button>
      )}
    </div>
  );
}

function ConfirmStep({
  pack,
  client,
  staff,
  soldByStaffId,
  canPickAnyStaff,
  onChangeSoldBy,
  method,
  onChangeMethod,
  amountPounds,
  onChangeAmount,
  reference,
  onChangeReference,
  notes,
  onChangeNotes,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  pack: PackOption;
  client: ClientLite;
  staff: StaffOption[];
  soldByStaffId: string;
  canPickAnyStaff: boolean;
  onChangeSoldBy: (id: string) => void;
  method: Method;
  onChangeMethod: (m: Method) => void;
  amountPounds: string;
  onChangeAmount: (v: string) => void;
  reference: string;
  onChangeReference: (v: string) => void;
  notes: string;
  onChangeNotes: (v: string) => void;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const amountPence = useMemo(() => {
    const n = Number(amountPounds);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [amountPounds]);
  const discountPence = pack.price_pence - amountPence;
  const isDiscounted = discountPence > 0;
  const isOverpaid = discountPence < 0;
  const soldByName =
    staff.find((s) => s.id === soldByStaffId)?.display_name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-cream-deep p-3">
        <p className="text-[12px] tracking-snug text-olive-soft">
          {client.full_name ?? client.email ?? "Client"} &middot; {pack.name}
        </p>
      </Card>

      {/* Sold by — visually prominent */}
      <Card className="border-[0.5px] border-sage/30 p-4">
        <p className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
          Sold by
        </p>
        {canPickAnyStaff ? (
          <select
            value={soldByStaffId}
            onChange={(e) => onChangeSoldBy(e.target.value)}
            className="mt-2 h-12 w-full rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[16px] font-medium text-olive shadow-1"
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-2 font-serif text-[20px] font-medium tracking-tight text-olive">
            {soldByName}
          </p>
        )}
      </Card>

      <Field label="Payment method">
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => {
            const selected = m.id === method;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeMethod(m.id)}
                aria-pressed={selected}
                className={cn(
                  "h-11 rounded-[12px] border-[0.5px] px-3 text-[13px] font-medium tracking-snug transition-colors duration-200 ease-ios",
                  selected
                    ? "border-transparent bg-sage text-cream"
                    : "border-hairline-strong bg-white text-olive hover:bg-cream-deep"
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Amount paid">
        <div className="flex items-center gap-2">
          <span className="text-[14px] tracking-snug text-olive-soft">£</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amountPounds}
            onChange={(e) => onChangeAmount(e.target.value)}
            className="h-11 w-full rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[16px] font-medium tabular-nums text-olive shadow-1"
          />
        </div>
        {isDiscounted && (
          <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
            That&rsquo;s {formatGBP(discountPence)} off catalog. Are you sure?
          </p>
        )}
        {isOverpaid && (
          <p className="mt-2 text-[12px] tracking-snug text-olive-soft">
            Above catalog price by {formatGBP(-discountPence)}.
          </p>
        )}
      </Field>

      <Field label="Reference (optional)">
        <input
          type="text"
          value={reference}
          onChange={(e) => onChangeReference(e.target.value)}
          placeholder="Terminal receipt, transfer ref, etc."
          className="h-11 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={3}
          placeholder="Visible to all staff later"
          className="rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-3 py-2 text-[14px] text-olive shadow-1 placeholder:text-olive-faint"
        />
      </Field>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={pending || !amountPounds || !soldByStaffId}
        >
          {pending ? "Recording" : `Create sale · ${formatGBP(amountPence)}`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-olive-soft"
        >
          Back
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}
