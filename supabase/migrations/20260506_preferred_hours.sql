-- Migration: preferred booking hours on the clients table.
-- Clients set their preferred start/end hour (0-23) in /portal/me → Settings.
-- SlotPicker uses these to visually highlight matching slots.
-- Both columns are nullable: null = no preference set.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS preferred_start_hour SMALLINT
    CHECK (preferred_start_hour IS NULL OR (preferred_start_hour >= 6 AND preferred_start_hour <= 21)),
  ADD COLUMN IF NOT EXISTS preferred_end_hour   SMALLINT
    CHECK (preferred_end_hour   IS NULL OR (preferred_end_hour   >= 7 AND preferred_end_hour   <= 22));
