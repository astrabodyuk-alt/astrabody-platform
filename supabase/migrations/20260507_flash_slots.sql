-- Migration: flash_slots table.
-- Flash Slots let admins publish same-day discounted deals for empty slots.
-- The checkout flow validates & claims a flash slot by id, overriding price.

CREATE TABLE IF NOT EXISTS flash_slots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  service_id            UUID        NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  -- null = any available practitioner
  staff_id              UUID        REFERENCES staff(id)              ON DELETE SET NULL,

  -- The exact time window being offered (tenant local tz stored as timestamptz)
  slot_start            TIMESTAMPTZ NOT NULL,
  slot_end              TIMESTAMPTZ NOT NULL,

  flash_price_pence     INTEGER     NOT NULL CHECK (flash_price_pence >= 0),
  original_price_pence  INTEGER     NOT NULL CHECK (original_price_pence >= 0),

  -- Short label shown on the deal card, e.g. "Flash Deal — Today Only"
  label                 TEXT        NOT NULL DEFAULT 'Flash Deal',
  -- Optional detail, e.g. "2 zones of Fat Freezing"
  description           TEXT,

  -- Allows multi-claim deals (default 1 = first come first served)
  max_claims            INTEGER     NOT NULL DEFAULT 1 CHECK (max_claims >= 1),
  claims_count          INTEGER     NOT NULL DEFAULT 0 CHECK (claims_count >= 0),

  status  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fully_claimed', 'expired', 'cancelled')),

  -- Auto-expires at slot_start if not claimed (cron / server-side check)
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: "give me active deals for this tenant right now"
CREATE INDEX IF NOT EXISTS flash_slots_tenant_active_idx
  ON flash_slots (tenant_id, status, expires_at);

-- Fast lookup: "is there an active flash deal for this service today?"
CREATE INDEX IF NOT EXISTS flash_slots_service_idx
  ON flash_slots (service_id, status, expires_at);

-- RLS: admins can do everything; portal clients can read active deals for their tenant.
ALTER TABLE flash_slots ENABLE ROW LEVEL SECURITY;

-- Admin: full access (service-role key bypasses RLS anyway, but for completeness)
CREATE POLICY "admin_all" ON flash_slots
  FOR ALL USING (true) WITH CHECK (true);
