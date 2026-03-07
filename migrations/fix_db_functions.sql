-- Migration: Fix fn_change_trip_status and fn_add_itinerary_item
-- Run this against your PostgreSQL database (Neon / Supabase / Railway)

-- ============================================================
-- 1. fn_change_trip_status
--    Bug: function compared lowercase actions ('confirm','cancel','complete')
--    but backend calls with uppercase ('CONFIRM','CANCEL','COMPLETE')
--    Fix: use UPPER() to normalize the input before comparing
-- ============================================================
CREATE OR REPLACE FUNCTION fn_change_trip_status(
  p_trip_id  UUID,
  p_user_id  UUID,
  p_action   TEXT   -- 'CONFIRM' | 'CANCEL' | 'COMPLETE'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_new_status     TEXT;
  v_action         TEXT := UPPER(TRIM(p_action));
BEGIN
  SELECT status INTO v_current_status
  FROM trips
  WHERE trip_id = p_trip_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found or access denied';
  END IF;

  CASE v_action
    WHEN 'CONFIRM' THEN
      IF v_current_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Only DRAFT trips can be confirmed (current: %)', v_current_status;
      END IF;
      v_new_status := 'CONFIRMED';

    WHEN 'CANCEL' THEN
      IF v_current_status NOT IN ('DRAFT', 'CONFIRMED') THEN
        RAISE EXCEPTION 'Only DRAFT or CONFIRMED trips can be cancelled (current: %)', v_current_status;
      END IF;
      v_new_status := 'CANCELLED';

    WHEN 'COMPLETE' THEN
      IF v_current_status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'Only CONFIRMED trips can be completed (current: %)', v_current_status;
      END IF;
      v_new_status := 'COMPLETED';

    ELSE
      RAISE EXCEPTION 'Invalid action: %. Must be CONFIRM, CANCEL, or COMPLETE', p_action;
  END CASE;

  UPDATE trips
  SET
    status       = v_new_status,
    confirmed_at = CASE WHEN v_new_status = 'CONFIRMED' THEN NOW() ELSE confirmed_at END,
    updated_at   = NOW()
  WHERE trip_id = p_trip_id;

  RETURN v_new_status;
END;
$$;


-- ============================================================
-- 2. fn_add_itinerary_item
--    Bug: DB function had 12 params with p_external_reference_id VARCHAR
--    and p_item_data JSONB, but backend calls with 9 positional params:
--    (tripId, dayId, item_type, place_reference_id UUID,
--     flight_reference_id UUID, start_time, end_time,
--     estimated_cost, notes)
--    Fix: rewrite to match the 9-param signature the backend uses
-- ============================================================
CREATE OR REPLACE FUNCTION fn_add_itinerary_item(
  p_trip_id             UUID,
  p_day_id              UUID,
  p_item_type           TEXT,        -- 'PLACE' | 'FLIGHT'
  p_place_reference_id  UUID,        -- NULL for FLIGHT
  p_flight_reference_id UUID,        -- NULL for PLACE
  p_start_time          TIME,
  p_end_time            TIME,
  p_estimated_cost      NUMERIC,
  p_notes               TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_position INT;
  v_item_id       UUID;
BEGIN
  -- Verify the day belongs to the trip
  IF NOT EXISTS (
    SELECT 1 FROM itinerary_days
    WHERE day_id = p_day_id AND trip_id = p_trip_id
  ) THEN
    RAISE EXCEPTION 'No itinerary day found: day % does not belong to trip %', p_day_id, p_trip_id;
  END IF;

  -- Calculate next order position
  SELECT COALESCE(MAX(order_position), 0) + 1
  INTO v_next_position
  FROM itinerary_items
  WHERE day_id = p_day_id;

  -- Insert the item
  INSERT INTO itinerary_items (
    day_id,
    item_type,
    place_reference_id,
    flight_reference_id,
    order_position,
    start_time,
    end_time,
    estimated_cost,
    notes,
    status
  )
  VALUES (
    p_day_id,
    p_item_type,
    p_place_reference_id,
    p_flight_reference_id,
    v_next_position,
    p_start_time,
    p_end_time,
    p_estimated_cost,
    p_notes,
    'PLANNED'
  )
  RETURNING item_id INTO v_item_id;

  RETURN v_item_id;
END;
$$;
