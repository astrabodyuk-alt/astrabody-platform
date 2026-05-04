/**
 * Client-safe shapes for intake forms. The server-only mutators live
 * in actions.ts; queries.ts re-exports these so existing server-side
 * imports keep working.
 */

export type IntakeFieldType =
  | "text"
  | "textarea"
  | "yes_no"
  | "multiple_choice"
  | "signature";

export interface IntakeField {
  /** UUID v4 — used as the answers JSON key. */
  id: string;
  type: IntakeFieldType;
  label: string;
  required: boolean;
  /** Only populated for multiple_choice. */
  options?: string[];
}

export interface IntakeFormRow {
  id: string;
  tenant_id: string;
  name: string;
  service_ids: string[];
  fields: IntakeField[];
  is_active: boolean;
  created_at: string;
}

export interface IntakeResponseRow {
  id: string;
  tenant_id: string;
  booking_id: string;
  form_id: string;
  client_id: string;
  answers: Record<string, string>;
  submitted_at: string | null;
  token: string;
  reminder_sent_at: string | null;
  expires_at: string;
  created_at: string;
}

export type IntakeAnswerValue = string;

export function isFieldEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "string") return true;
  return value.trim().length === 0;
}
