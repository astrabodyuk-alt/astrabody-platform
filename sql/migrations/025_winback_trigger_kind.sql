-- =====================================================
-- Astrabody Platform — Migration 025
-- Add 'win_back' to comms_proposals.trigger_kind
-- =====================================================
-- The /admin/analytics win-back panel queues a comms_proposals row
-- with trigger_kind='win_back' for each lapsed client. The original
-- check (migration 021) didn't include this value — extend it.
-- One-line constraint swap; no data migration.
-- =====================================================

alter table public.comms_proposals
  drop constraint if exists comms_proposals_trigger_kind_check;

alter table public.comms_proposals
  add constraint comms_proposals_trigger_kind_check
  check (trigger_kind in (
    'studio_closure',
    'bank_holiday_closure',
    'working_hours_change',
    'service_price_change',
    'new_service',
    'flash_slot',
    'new_package',
    'loyalty_promotion',
    'studio_reopening',
    'win_back'
  ));

-- =====================================================
-- DONE.
-- =====================================================
