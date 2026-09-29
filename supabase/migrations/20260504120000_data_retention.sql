-- Data retention policy for analytics tracking tables
-- Deletes event_tracking and ad_events records older than 180 days
-- Keeps ab_events for 365 days (A/B tests run longer)

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_tracking_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_events integer;
  deleted_ads integer;
  deleted_ab integer;
BEGIN
  -- Delete event_tracking records older than 180 days
  DELETE FROM event_tracking
  WHERE created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  -- Delete ad_events records older than 180 days
  DELETE FROM ad_events
  WHERE created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS deleted_ads = ROW_COUNT;

  -- Delete ab_events records older than 365 days
  DELETE FROM ab_events
  WHERE created_at < NOW() - INTERVAL '365 days';
  GET DIAGNOSTICS deleted_ab = ROW_COUNT;

  RAISE LOG 'Data retention cleanup: deleted % event_tracking, % ad_events, % ab_events',
    deleted_events, deleted_ads, deleted_ab;
END;
$$;

-- Grant execute to service_role for manual runs
GRANT EXECUTE ON FUNCTION cleanup_old_tracking_data() TO service_role;

-- Note: To enable automatic daily cleanup, enable pg_cron extension and run:
-- SELECT cron.schedule('cleanup-tracking-data', '0 3 * * *', 'SELECT cleanup_old_tracking_data()');
-- pg_cron must be enabled via Supabase dashboard > Database > Extensions
