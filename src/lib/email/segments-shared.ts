/**
 * Client-safe segment types + descriptors. The server-side resolver
 * lives in segments.ts and pulls these in. Any client component that
 * needs to render a segment label or build a SegmentQuery should
 * import from this file, not segments.ts.
 */

export type SegmentQuery =
  | { type: "all" }
  | { type: "inactive_60d" }
  | { type: "tier"; params: { min: "insider" | "inner_circle" } }
  | { type: "service"; params: { serviceId: string } };

export function describeSegment(query: SegmentQuery): string {
  switch (query.type) {
    case "all":
      return "Everyone (consenting clients)";
    case "inactive_60d":
      return "Inactive (60+ days no booking)";
    case "tier":
      return query.params?.min === "inner_circle"
        ? "Tier: Inner Circle"
        : "Tier: Insider+";
    case "service":
      return "Booked a specific service";
    default:
      return "Unknown segment";
  }
}
