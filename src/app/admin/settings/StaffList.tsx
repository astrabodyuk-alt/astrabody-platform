"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { setMemberRole } from "./actions";
import { EditStaffSheet } from "./EditStaffSheet";

interface StaffRow {
  id: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
  user_id: string | null;
  role: string | null;
  photo_url: string | null;
  bio_short: string | null;
  specialties: string[] | null;
  commission_rate_pct: number | null;
}

export function StaffList({
  staff,
  isOwner,
  isOwnerOrAdmin,
  currentStaffId,
  serviceNames,
}: {
  staff: StaffRow[];
  isOwner: boolean;
  isOwnerOrAdmin: boolean;
  currentStaffId: string | null;
  serviceNames: string[];
}) {
  const [editing, setEditing] = useState<StaffRow | null>(null);

  return (
    <>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b-[0.5px] border-hairline">
            <Th>Profile</Th>
            <Th>Email</Th>
            <Th>Linked</Th>
            <Th>Role</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {staff.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-[13px] text-olive-soft"
              >
                No staff yet.
              </td>
            </tr>
          ) : (
            staff.map((s) => {
              const canEdit = isOwnerOrAdmin || s.id === currentStaffId;
              return (
                <Row
                  key={s.id}
                  staff={s}
                  isOwner={isOwner}
                  canEditProfile={canEdit}
                  onEditProfile={() => setEditing(s)}
                />
              );
            })
          )}
        </tbody>
      </table>

      <EditStaffSheet
        open={!!editing}
        staff={editing}
        serviceNames={serviceNames}
        canEditCommission={isOwnerOrAdmin}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function Row({
  staff,
  isOwner,
  canEditProfile,
  onEditProfile,
}: {
  staff: StaffRow;
  isOwner: boolean;
  canEditProfile: boolean;
  onEditProfile: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRoleChange(role: string) {
    if (!staff.user_id) return;
    startTransition(async () => {
      const r = await setMemberRole({
        userId: staff.user_id!,
        role: role as "owner" | "admin" | "staff" | "viewer",
      });
      if (r.ok) router.refresh();
    });
  }

  return (
    <tr className="border-b-[0.5px] border-hairline last:border-b-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {staff.photo_url ? (
            <Image
              src={staff.photo_url}
              alt={staff.display_name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <InitialsCircle name={staff.display_name} />
          )}
          <div className="flex flex-col">
            <span className="text-[14px] font-medium tracking-snug text-olive">
              {staff.display_name}
            </span>
            {staff.specialties && staff.specialties.length > 0 && (
              <span className="text-[11px] tracking-snug text-olive-soft">
                {staff.specialties.slice(0, 3).join(" · ")}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[13px] tracking-snug text-olive-soft">
        {staff.email ?? "—"}
      </td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-olive-soft">
        {staff.user_id ? "✓ user linked" : "—"}
      </td>
      <td className="px-4 py-3">
        {staff.user_id && staff.role ? (
          isOwner ? (
            <select
              value={staff.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={pending}
              className="h-9 rounded-[12px] border-[0.5px] border-hairline-strong bg-white px-2 text-[13px] text-olive shadow-1"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          ) : (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-label-caps"
              style={{
                background: "rgba(117,133,100,0.10)",
                color: "#5C6B4E",
              }}
            >
              {staff.role}
            </span>
          )
        ) : (
          <span className="text-[12px] text-olive-faint">— not linked</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {canEditProfile && (
          <button
            type="button"
            onClick={onEditProfile}
            className="text-[12px] font-medium tracking-snug text-sage-deep hover:underline"
          >
            Edit profile
          </button>
        )}
      </td>
    </tr>
  );
}

function InitialsCircle({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium tracking-snug text-cream"
      style={{ background: "linear-gradient(135deg, #758564, #5C6B4E)" }}
      aria-hidden
    >
      {initials || "✨"}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-label-caps text-olive-soft">
      {children}
    </th>
  );
}
