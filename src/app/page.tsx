import { redirect } from "next/navigation";

/**
 * Marketing site lives elsewhere (astrabody.co.uk). The platform's
 * root just sends people into the portal until we add a landing page.
 */
export default function RootPage() {
  redirect("/portal");
}
