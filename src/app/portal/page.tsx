import { redirect } from "next/navigation";
import { getCurrentClient } from "@/lib/portal/queries";
import { HomeClient } from "./HomeClient";

export default async function PortalHomePage() {
  const me = await getCurrentClient().catch(() => null);
  if (!me) redirect("/portal/login");
  return <HomeClient />;
}
