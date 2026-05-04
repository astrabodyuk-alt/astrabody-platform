/**
 * Loyalty earn rate. Single source of truth.
 * Per /Astrabody/CLAUDE.md §8: 10 points per £1 spent on a completed booking.
 * Money is stored in pence, so 10 / 100 = 0.1 points per pence.
 *
 * Use pointsForPrice() for the rounded integer value shown to the client.
 */
export const EARN_RATE_POINTS_PER_PENCE = 0.1;

export function pointsForPrice(pricePence: number): number {
  return Math.floor(pricePence * EARN_RATE_POINTS_PER_PENCE);
}
