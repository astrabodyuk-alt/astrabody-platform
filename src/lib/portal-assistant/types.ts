/**
 * Shared types for the floating portal assistant. Client + server use
 * these to keep the wire format consistent.
 */

export interface ServiceLite {
  id: string;
  name: string;
  durationMin: number;
  pricePence: number;
}

export interface PackCatalogueRow {
  id: string;
  name: string;
  serviceName: string;
  sessions: number;
  pricePence: number;
}

export interface ActivePackRow {
  serviceName: string;
  sessionsRemaining: number;
  totalSessions: number;
  expiresAt: string;
}

export interface UpcomingBookingRow {
  serviceName: string;
  staffName: string;
  startsAt: string;
  status: string;
}

export interface RecentBookingRow {
  serviceName: string;
  staffName: string;
  completedAt: string;
}

export interface WorkingHoursRow {
  dayOfWeek: number; // 0 = Sunday
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
}

export interface PortalAssistantContext {
  clientId: string;
  tenantId: string;
  clientName: string;
  tenantName: string;
  tenantTimezone: string;
  studioPhone: string | null;
  studioAddress: string | null;
  services: ServiceLite[];
  packCatalogue: PackCatalogueRow[];
  activePacks: ActivePackRow[];
  upcomingBookings: UpcomingBookingRow[];
  recentBookings: RecentBookingRow[];
  loyaltyPoints: number;
  loyaltyTierName: string | null;
  giftCardBalance: number;
  activePromotions: string[];
  workingHours: WorkingHoursRow[];
}

export type AssistantAction =
  | null
  | {
      type: "SHOW_SLOTS";
      serviceId: string;
      date: string; // YYYY-MM-DD
      timeWindow?: "morning" | "afternoon" | "evening" | null;
    }
  | {
      type: "CONFIRM_BOOKING";
      serviceId: string;
      staffId: string | null;
      slotDatetime: string; // ISO
    }
  | { type: "CLARIFY_DATE" }
  | { type: "CLARIFY_SERVICE" }
  | { type: "RECOMMEND" };

export interface AssistantReply {
  message: string;
  action: AssistantAction;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface BookingFlowState {
  step: "choose_service" | "choose_slot" | "confirm";
  serviceId?: string;
  serviceName?: string;
  staffId?: string | null;
  staffName?: string | null;
  slotDatetime?: string;
  availableSlots?: Array<{
    datetime: string;
    staffId: string | null;
    staffName: string;
  }>;
}
