import { NextResponse } from "next/server";
import { getCurrentClient, getLoyaltyAccount, getNextBooking } from "@/lib/portal/queries";
import { getActiveFlashSlotsForPortal } from "@/lib/flash-slots/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentClient().catch(() => null);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [loyalty, nextBooking, flashSlots] = await Promise.all([
      getLoyaltyAccount(me.id),
      getNextBooking(me.id),
      getActiveFlashSlotsForPortal().catch(() => []),
    ]);

    return NextResponse.json({
      clientId: me.id,
      firstName: me.firstName,
      loyalty,
      nextBooking,
      flashSlots,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
