-- =====================================================
-- Astrabody Platform — Migration 005
-- Realtime publication for chat_messages
-- =====================================================
-- Supabase Realtime broadcasts row-level postgres_changes only for
-- tables explicitly added to the supabase_realtime publication.
-- The /portal/chat client subscribes to INSERTs filtered by thread_id;
-- without this membership, no events are emitted.
--
-- Idempotent: ALTER PUBLICATION ADD TABLE errors if the table is
-- already a member, so we wrap in a DO block that catches duplicate_object.
-- =====================================================

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then
    raise notice 'public.chat_messages already in supabase_realtime publication';
end $$;
