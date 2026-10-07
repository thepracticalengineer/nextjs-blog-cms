-- A dispatcher claim is not proof of provider handoff. A token fences revoked
-- workers; the durable handoff marker prevents retrying ambiguous deliveries.
ALTER TABLE public.newsletter_sends
  ADD COLUMN dispatch_token UUID,
  ADD COLUMN delivery_started_at TIMESTAMPTZ;

-- Historical claims may already have reached the provider. Preserve their
-- conservative retry protection; only new claims use the distinct marker.
UPDATE public.newsletter_sends
SET delivery_started_at = sending_started_at
WHERE sending_started_at IS NOT NULL;

COMMENT ON COLUMN public.newsletter_sends.dispatch_token IS 'Current dispatcher ownership; reset on pre-handoff retry or recovery.';
COMMENT ON COLUMN public.newsletter_sends.delivery_started_at IS 'Persisted before the first provider attempt; non-null forbids replay.';
