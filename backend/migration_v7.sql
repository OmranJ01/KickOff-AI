-- ── Date-specific slots (real calendar booking) ───────────────────
-- Replaces day-of-week logic with actual dates.
-- stadium_schedule still stores the weekly template for owners to configure.
-- stadium_date_slots stores the concrete, date-specific bookable slots.

CREATE TABLE IF NOT EXISTS stadium_date_slots (
  id           SERIAL PRIMARY KEY,
  stadium_id   INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
  slot_date    DATE NOT NULL,
  slot_start   TIME NOT NULL,
  slot_end     TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(stadium_id, slot_date, slot_start)
);

CREATE INDEX IF NOT EXISTS idx_date_slots_stadium_date
  ON stadium_date_slots(stadium_id, slot_date);

-- ── Add booking_date to existing bookings ─────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_date DATE;

-- Backfill: old records get today as a placeholder (they are legacy)
UPDATE bookings SET booking_date = CURRENT_DATE WHERE booking_date IS NULL;
