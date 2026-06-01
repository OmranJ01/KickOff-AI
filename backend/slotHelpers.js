function toMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}
function fromMin(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Called when owner confirms a booking.
// Deletes the parent date-slot and inserts up to 2 new slots for the remaining time.
async function splitSlot(client, booking) {
  if (!booking.booking_date || !booking.parent_schedule_id) return;

  const slotRes = await client.query(
    'SELECT * FROM stadium_date_slots WHERE id=$1',
    [booking.parent_schedule_id]
  );
  if (!slotRes.rows.length) return;

  const slot = slotRes.rows[0];
  const sStart = toMin(slot.slot_start);
  const sEnd   = toMin(slot.slot_end);
  const bStart = toMin(booking.booked_start);
  const bEnd   = toMin(booking.booked_end);

  await client.query('DELETE FROM stadium_date_slots WHERE id=$1', [slot.id]);

  if (bStart > sStart) {
    await client.query(
      `INSERT INTO stadium_date_slots (stadium_id, slot_date, slot_start, slot_end, is_available)
       VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (stadium_id, slot_date, slot_start) DO NOTHING`,
      [slot.stadium_id, slot.slot_date, fromMin(sStart), fromMin(bStart)]
    );
  }
  if (bEnd < sEnd) {
    await client.query(
      `INSERT INTO stadium_date_slots (stadium_id, slot_date, slot_start, slot_end, is_available)
       VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (stadium_id, slot_date, slot_start) DO NOTHING`,
      [slot.stadium_id, slot.slot_date, fromMin(bEnd), fromMin(sEnd)]
    );
  }

  // Re-attach sibling pending bookings to whichever new slot still contains their range
  const newSlotsRes = await client.query(
    `SELECT * FROM stadium_date_slots
     WHERE stadium_id=$1 AND slot_date=$2 AND slot_start IN ($3::time, $4::time)`,
    [slot.stadium_id, slot.slot_date, fromMin(sStart), fromMin(bEnd)]
  );

  const otherBookings = await client.query(
    `SELECT * FROM bookings WHERE parent_schedule_id=$1 AND status='pending' AND id<>$2`,
    [booking.parent_schedule_id, booking.id]
  );

  for (const ob of otherBookings.rows) {
    const obStart = toMin(ob.booked_start);
    const obEnd   = toMin(ob.booked_end);
    for (const ns of newSlotsRes.rows) {
      const nsStart = toMin(ns.slot_start);
      const nsEnd   = toMin(ns.slot_end);
      if (obStart >= nsStart && obEnd <= nsEnd) {
        await client.query('UPDATE bookings SET parent_schedule_id=$1 WHERE id=$2', [ns.id, ob.id]);
        break;
      }
    }
  }
}

// Called when a confirmed booking is cancelled.
// Re-inserts the booked window and merges with adjacent free slots.
async function restoreSlot(client, booking) {
  if (!booking.booking_date) return; // legacy booking without date — skip

  const stadiumId   = booking.stadium_id;
  const bookingDate = booking.booking_date;
  const bStart      = toMin(booking.booked_start);
  const bEnd        = toMin(booking.booked_end);

  // If the original parent slot still exists the booking was never confirmed — nothing to restore
  if (booking.parent_schedule_id) {
    const parentCheck = await client.query(
      'SELECT id FROM stadium_date_slots WHERE id=$1', [booking.parent_schedule_id]
    );
    if (parentCheck.rows.length) return;
  }

  const adjacentRes = await client.query(
    `SELECT * FROM stadium_date_slots
     WHERE stadium_id=$1 AND slot_date=$2
       AND (slot_end=$3::time OR slot_start=$4::time)
     ORDER BY slot_start`,
    [stadiumId, bookingDate, fromMin(bStart), fromMin(bEnd)]
  );

  let mergedStart = bStart, mergedEnd = bEnd;
  const toDelete = [];
  for (const adj of adjacentRes.rows) {
    const adjStart = toMin(adj.slot_start);
    const adjEnd   = toMin(adj.slot_end);
    if (adjEnd === bStart)  { mergedStart = adjStart; toDelete.push(adj.id); }
    if (adjStart === bEnd)  { mergedEnd   = adjEnd;   toDelete.push(adj.id); }
  }

  for (const id of toDelete) await client.query('DELETE FROM stadium_date_slots WHERE id=$1', [id]);

  await client.query(
    `INSERT INTO stadium_date_slots (stadium_id, slot_date, slot_start, slot_end, is_available)
     VALUES ($1,$2,$3,$4,TRUE)
     ON CONFLICT (stadium_id, slot_date, slot_start) DO UPDATE SET slot_end=$4, is_available=TRUE`,
    [stadiumId, bookingDate, fromMin(mergedStart), fromMin(mergedEnd)]
  );
}

module.exports = { toMin, fromMin, splitSlot, restoreSlot };
