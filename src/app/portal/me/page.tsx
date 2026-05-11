import { redirect } from "next/navigation";
import { getCurrentClient } from "@/lib/portal/queries";
import { MeClient } from "./MeClient";

export default async function PortalMePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");
  return <MeClient />;
}
