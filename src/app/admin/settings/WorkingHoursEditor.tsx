"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setWorkingHours } from "./actions";

interface StaffMin {
  id: string;
  display_name: string;
}

interface HourRow {
  weekday: number;
  start: string;
  end: string;
}

const DAYS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

export function WorkingHoursEditor({
  staff,
  hoursByStaff,
  currentStaffId,
  isOwnerOrAdmin,
}: {
  staff: StaffMin[];
  hoursByStaff: Record<string, HourRow[]>;
  currentStaffId: string | null;
  isOwnerOrAdmin: boolean;
}) {
  const initialStaffId = currentStaffId ?? staff[0]?.id ?? null;
  const [selectedStaff, setSelectedStaff] = useState<string | null>(initialStaffId);

  if (!selectedStaff) {
    return (
      <Card className="p-5">
        <p className="text-[13px] tracking-snug text-olive-soft">
          No active staff yet.
        </p>
      </Card>
    );
  }

  const canEdit = isOwnerOrAdmin || selectedStaff === currentStaffId;

  return (
    <div className="flex flex-col gap-4">
      {staff.length > 1 && isOwnerOrAdmin && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
            Staff
          </span>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="h-9 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-2 text-[13px] text-olive shadow-1"
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Editor
        key={selectedStaff}
        staffId={selectedStaff}
        initial={hoursByStaff[selectedStaff] ?? []}
        canEdit={canEdit}
      />
    </div>
  );
}

function Editor({
  staffId,
  initial,
  canEdit,
}: {
  staffId: string;
  initial: HourRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [hours, setHours] = useState<Record<number, { start: string; end: string } | null>>(() => {
    const out: Record<number, { start: string; end: string } | null> = {};
    for (const d of DAYS) out[d.weekday] = null;
    for (const h of initial) {
      out[h.weekday] = { start: h.start, end: h.end };
    }
    return out;
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(weekday: number, patch: Partial<{ start: string; end: string }>) {
    setHours((prev) => {
      const cur = prev[weekday] ?? { start: "09:00", end: "17:00" };
      return { ...prev, [weekday]: { ...cur, ...patch } };
    });
  }

  function setOpen(weekday: number, open: boolean) {
    setHours((prev) => ({
      ...prev,
      [weekday]: open ? prev[weekday] ?? { start: "09:00", end: "17:00" } : null,
    }));
  }

  function handleSave() {
    const list: Array<{ weekday: number; start: string; end: string }> = [];
    for (const d of DAYS) {
      const h = hours[d.weekday];
      if (h) list.push({ weekday: d.weekday, start: h.start, end: h.end });
    }
    startTransition(async () => {
      setError(null);
      const r = await setWorkingHours({ staffId, hours: list });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col">
        {DAYS.map(({ weekday, label }) => {
          const h = hours[weekday];
          return (
            <div
              key={weekday}
              className="flex items-center justify-between gap-3 border-b-[0.5px] border-hairline py-3 last:border-b-0"
            >
              <div className="flex flex-col">
                <span className="text-[14px] font-medium tracking-snug text-olive">
                  {label}
                </span>
                {!h && (
                  <span className="text-[12px] tracking-snug text-olive-faint">
                    Closed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {h && (
                  <>
                    <input
                      type="time"
                      value={h.start}
                      onChange={(e) => update(weekday, { start: e.target.value })}
                      disabled={!canEdit}
                      className="h-9 w-[100px] rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-2 text-[13px] tabular-nums text-olive shadow-1 disabled:opacity-50"
                    />
                    <span className="text-olive-soft">→</span>
                    <input
                      type="time"
                      value={h.end}
                      onChange={(e) => update(weekday, { end: e.target.value })}
                      disabled={!canEdit}
                      className="h-9 w-[100px] rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-2 text-[13px] tabular-nums text-olive shadow-1 disabled:opacity-50"
                    />
                  </>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setOpen(weekday, !h)}
                    className="rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-label-caps text-sage-deep hover:underline"
                  >
                    {h ? "Close" : "Open"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      {canEdit && (
        <div className="self-start">
          <Button type="button" variant="primary" size="sm" onClick={handleSave} disabled={pending}>
            {pending ? "Saving" : saved ? "Saved ✓" : "Save hours"}
          </Button>
        </div>
      )}
    </Card>
  );
}
