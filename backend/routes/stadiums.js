const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate, requireOwner } = require("../middleware");



router.get('/mine', authenticate, requireOwner, async (req, res) => {

  try {
    const r = await pool.query(
      'SELECT * FROM stadiums WHERE owner_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json(r.rows);
  } 

  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.post('/', authenticate, requireOwner, async (req, res) => {

  const { name, city, country, description, price_per_hour, capacity, surface, phone, open_time, close_time, image_url } = req.body;
  if (!name || !city || !price_per_hour) 
    return res.status(400).json({ error: 'Name, city and price are required' });

  try {
    const r = await pool.query(
      `INSERT INTO stadiums (owner_id,name,city,country,description,price_per_hour,capacity,surface,phone,open_time,close_time,image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.id, name, city, country || null, description || null, price_per_hour, capacity || null,
       surface || 'grass', phone || null, open_time || '08:00', close_time || '22:00', image_url || null]
    );
    res.status(201).json(r.rows[0]);
  }
   catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.put('/:id', authenticate, requireOwner, async (req, res) => {
  const { name, city, country, description, price_per_hour, capacity, surface, phone, open_time, close_time, is_active, image_url } = req.body;
  try {
    const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const r = await pool.query(
      `UPDATE stadiums SET name=$1,city=$2,country=$3,description=$4,price_per_hour=$5,capacity=$6,surface=$7,
         phone=$8,open_time=$9,close_time=$10,is_active=$11,image_url=$12,updated_at=NOW()
       WHERE id=$13 AND owner_id=$14 RETURNING *`,
      [name, city, country || null, description || null, price_per_hour, capacity || null, surface || 'grass',
       phone || null, open_time || '08:00', close_time || '22:00',
       is_active !== undefined ? is_active : true, image_url || null, req.params.id, req.user.id]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.delete('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM stadiums WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    res.json({ success: true });
  } 

  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.patch('/:id/toggle', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE stadiums SET is_active=NOT is_active,updated_at=NOW() WHERE id=$1 AND owner_id=$2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    res.json(r.rows[0]);
  } 
  
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


// Browse stadiums (players) — filter by name, city, country, day, time range
router.get('/', authenticate, async (req, res) => {

  const q = (req.query.q || '').trim();
  const city = (req.query.city || '').trim();
  const country = (req.query.country || '').trim();
  const day = req.query.day !== undefined && req.query.day !== '' ? parseInt(req.query.day) : null;
  const slotStart = req.query.slot_start || null;
  const slotEnd = req.query.slot_end || null;

  try {
    const conditions = ['s.is_active=TRUE'];
    const params = [];
    let idx = 1;
    if (q) { conditions.push(`(s.name ILIKE $${idx} OR s.city ILIKE $${idx} OR s.country ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
    if (city) { conditions.push(`s.city ILIKE $${idx}`); params.push(`%${city}%`); idx++; }
    if (country) { conditions.push(`s.country ILIKE $${idx}`); params.push(`%${country}%`); idx++; }
    let joinClause = '';

    if (day !== null) {
      joinClause = `JOIN stadium_schedule ss ON ss.stadium_id=s.id AND ss.day_of_week=$${idx} AND ss.is_available=TRUE`;
      params.push(day); idx++;
      if (slotStart && slotEnd) {
        joinClause += ` AND ss.slot_start<=$${idx}::time AND ss.slot_end>=$${idx+1}::time`;
        params.push(slotStart, slotEnd); idx += 2;
      }
    }

    const where = conditions.join(' AND ');
    const sql = `SELECT DISTINCT s.*, u.name AS owner_name, u.avatar_url AS owner_avatar,
       (SELECT ROUND(AVG(r.rating),1) FROM stadium_reviews r WHERE r.stadium_id=s.id) AS avg_rating,
       (SELECT COUNT(*)::int FROM stadium_reviews r WHERE r.stadium_id=s.id) AS review_count
       FROM stadiums s JOIN users u ON s.owner_id=u.id ${joinClause} WHERE ${where} ORDER BY s.created_at DESC LIMIT 50`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } 
  
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  SCHEDULE
// ══════════════════════════════════════════════════════════════════

router.get('/:id/schedule', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM stadium_schedule WHERE stadium_id=$1 ORDER BY day_of_week,slot_start',
      [req.params.id]
    );
    res.json(r.rows);
  } 
  
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});



router.put('/:id/schedule', authenticate, requireOwner, async (req, res) => {
  const { slots } = req.body;

  if (!Array.isArray(slots))
     return res.status(400).json({ error: 'slots must be an array' });

  const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);

  if (!check.rows.length) 
    return res.status(404).json({ error: 'Stadium not found' });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM stadium_schedule WHERE stadium_id=$1', [req.params.id]);

    for (const s of slots) {
      await client.query(
        `INSERT INTO stadium_schedule (stadium_id,day_of_week,slot_start,slot_end,is_available)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, s.day_of_week, s.slot_start, s.slot_end, s.is_available !== false]
      );

    }

    await client.query('COMMIT');
    const r = await client.query(
      'SELECT * FROM stadium_schedule WHERE stadium_id=$1 ORDER BY day_of_week,slot_start',
      [req.params.id]
    );

    res.json(r.rows);
  } 
  
  catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Get available slots for a stadium on a given day
// Returns real schedule slots with overlap info for the player booking UI
// GET /api/stadiums/:id/slots?day=1
router.get('/:id/slots', authenticate, async (req, res) => {
  const day = parseInt(req.query.day);
  if (isNaN(day)) return res.status(400).json({ error: 'day is required' });
  try {
    // Get available schedule slots
    const scheduleRes = await pool.query(
      `SELECT * FROM stadium_schedule
       WHERE stadium_id=$1 AND day_of_week=$2 AND is_available=TRUE
       ORDER BY slot_start`,
      [req.params.id, day]
    );

    // Get confirmed bookings — these actually shrink the available window
    // Pending bookings do NOT block the slot until owner confirms
    const bookingsRes = await pool.query(
      `SELECT booked_start, booked_end, status FROM bookings
       WHERE stadium_id=$1 AND day_of_week=$2 AND status='confirmed'`,
      [req.params.id, day]
    );

    // Pending bookings shown separately — players can see others are interested
    const pendingRes = await pool.query(
      `SELECT booked_start, booked_end FROM bookings
       WHERE stadium_id=$1 AND day_of_week=$2 AND status='pending'`,
      [req.params.id, day]
    );

    res.json({
      slots: scheduleRes.rows,
      bookings: bookingsRes.rows,       // confirmed only — used to shrink free windows
      pending: pendingRes.rows          // pending only — shown as "someone interested" indicator
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


router.get('/:id/default-schedule', authenticate, requireOwner, async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const r = await pool.query(
      'SELECT * FROM stadium_default_schedule WHERE stadium_id=$1 ORDER BY day_of_week, slot_start',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT  /api/stadiums/:id/default-schedule  → save current schedule as default template
router.put('/:id/default-schedule', authenticate, requireOwner, async (req, res) => {

  const { slots } = req.body;
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots required' });

  const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });

  const client = await pool.connect();

  try {

    await client.query('BEGIN');
    await client.query('DELETE FROM stadium_default_schedule WHERE stadium_id=$1', [req.params.id]);
    for (const s of slots) {
      await client.query(
        `INSERT INTO stadium_default_schedule (stadium_id, day_of_week, slot_start, slot_end)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [req.params.id, s.day_of_week, s.slot_start, s.slot_end]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } 
  
  catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Server error' }); }
  
  finally { client.release(); }
});



// POST /api/stadiums/:id/reset-schedule  → reset a specific day (or all days) to default template
router.post('/:id/reset-schedule', authenticate, requireOwner, async (req, res) => {

  const { day } = req.body; // number 0-6 or undefined/null = reset all days
  const hasDay = day !== undefined && day !== null;
  const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });

  const client = await pool.connect();

  try {

    await client.query('BEGIN');
    // Load default template
    const defRes = await client.query(
      hasDay
        ? 'SELECT * FROM stadium_default_schedule WHERE stadium_id=$1 AND day_of_week=$2'
        : 'SELECT * FROM stadium_default_schedule WHERE stadium_id=$1',
      hasDay ? [req.params.id, day] : [req.params.id]
    );
    
    if (!defRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No default schedule saved yet' }); }
    // Delete existing live slots for requested day(s)
    await client.query(
      hasDay
        ? 'DELETE FROM stadium_schedule WHERE stadium_id=$1 AND day_of_week=$2'
        : 'DELETE FROM stadium_schedule WHERE stadium_id=$1',
      hasDay ? [req.params.id, day] : [req.params.id]
    );
    // Reinsert from default template
    for (const s of defRes.rows) {
      await client.query(
        `INSERT INTO stadium_schedule (stadium_id, day_of_week, slot_start, slot_end, is_available)
         VALUES ($1,$2,$3,$4,TRUE)`,
        [req.params.id, s.day_of_week, s.slot_start, s.slot_end]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, restored: defRes.rows.length });
  } 
  
  catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════
//  DATE-BASED BOOKING SYSTEM (dynamic — derived from weekly schedule)
// ══════════════════════════════════════════════════════════════════

// GET /api/stadiums/:id/date-slots?date=YYYY-MM-DD
// Derives available slots from weekly schedule for the given date's day-of-week.
// Returns free slot windows + confirmed + pending bookings for that date.
router.get('/:id/date-slots', authenticate, async (req, res) => {
  const dateStr = req.query.date;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
  try {
    const dow = new Date(dateStr + 'T12:00:00').getDay();
    const [slotsRes, bookingsRes, pendingRes] = await Promise.all([
      pool.query(
        `SELECT id, slot_start, slot_end FROM stadium_schedule
         WHERE stadium_id=$1 AND day_of_week=$2 AND is_available=TRUE ORDER BY slot_start`,
        [req.params.id, dow]
      ),
      pool.query(
        `SELECT booked_start, booked_end FROM bookings
         WHERE stadium_id=$1 AND booking_date=$2 AND status='confirmed'`,
        [req.params.id, dateStr]
      ),
      pool.query(
        `SELECT booked_start, booked_end FROM bookings
         WHERE stadium_id=$1 AND booking_date=$2 AND status='pending'`,
        [req.params.id, dateStr]
      )
    ]);
    res.json({ slots: slotsRes.rows, bookings: bookingsRes.rows, pending: pendingRes.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/stadiums/:id/month-availability?year=YYYY&month=M
// Returns per-day status for a full month: available / partial / full / closed / past
router.get('/:id/month-availability', authenticate, async (req, res) => {
  const year  = parseInt(req.query.year);
  const month = parseInt(req.query.month); // 1-12
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12)
    return res.status(400).json({ error: 'year and month (1-12) required' });
  try {
    // Weekly schedule total minutes per day-of-week
    const schedRes = await pool.query(
      `SELECT day_of_week,
              SUM(EXTRACT(EPOCH FROM (slot_end::time - slot_start::time))/60)::int AS total_min
       FROM stadium_schedule
       WHERE stadium_id=$1 AND is_available=TRUE
       GROUP BY day_of_week`,
      [req.params.id]
    );
    const schedByDow = {};
    for (const r of schedRes.rows) schedByDow[r.day_of_week] = r.total_min;

    // Confirmed bookings grouped by date for the requested month
    const monthStart = `${year}-${String(month).padStart(2,'0')}-01`;
    const bookRes = await pool.query(
      `SELECT booking_date::text AS date,
              SUM(EXTRACT(EPOCH FROM (booked_end::time - booked_start::time))/60)::int AS booked_min
       FROM bookings
       WHERE stadium_id=$1
         AND booking_date >= $2::date
         AND booking_date < ($2::date + INTERVAL '1 month')
         AND status='confirmed'
       GROUP BY booking_date`,
      [req.params.id, monthStart]
    );
    const bookedByDate = {};
    for (const r of bookRes.rows) bookedByDate[r.date] = r.booked_min;

    const today = new Date().toISOString().slice(0, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const result = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow = new Date(dateStr + 'T12:00:00').getDay();
      const totalMin = schedByDow[dow] || 0;
      const bookedMin = bookedByDate[dateStr] || 0;
      let status;
      if (dateStr < today)              status = 'past';
      else if (totalMin === 0)          status = 'closed';
      else if (bookedMin >= totalMin)   status = 'full';
      else if (bookedMin > 0)           status = 'partial';
      else                              status = 'available';
      result.push({ date: dateStr, status });
    }
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  OWNER ANALYTICS
// ══════════════════════════════════════════════════════════════════
router.get('/:id/analytics', authenticate, requireOwner, async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT price_per_hour FROM stadiums WHERE id=$1 AND owner_id=$2',
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const pricePerHour = Number(check.rows[0].price_per_hour);

    const [summaryRes, dowRes, hoursRes, trendRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='confirmed'
            AND booking_date >= DATE_TRUNC('month', CURRENT_DATE)) AS month_confirmed,
          COUNT(*) FILTER (WHERE status='pending')                  AS pending_now,
          COUNT(*) FILTER (WHERE status='cancelled'
            AND booking_date >= DATE_TRUNC('month', CURRENT_DATE)) AS month_cancelled,
          COALESCE(SUM(CASE WHEN status='confirmed'
            AND booking_date >= DATE_TRUNC('month', CURRENT_DATE) THEN
            EXTRACT(EPOCH FROM (booked_end::time - booked_start::time))/3600 END), 0) AS month_hours,
          COUNT(*) FILTER (WHERE status='confirmed') AS total_confirmed,
          COALESCE(SUM(CASE WHEN status='confirmed' THEN
            EXTRACT(EPOCH FROM (booked_end::time - booked_start::time))/3600 END), 0) AS total_hours
        FROM bookings WHERE stadium_id=$1
      `, [req.params.id]),

      pool.query(`
        SELECT day_of_week AS dow, COUNT(*)::int AS bookings
        FROM bookings WHERE stadium_id=$1 AND status='confirmed'
        GROUP BY day_of_week ORDER BY day_of_week
      `, [req.params.id]),

      pool.query(`
        SELECT EXTRACT(HOUR FROM booked_start::time)::int AS hour, COUNT(*)::int AS count
        FROM bookings WHERE stadium_id=$1 AND status='confirmed'
        GROUP BY hour ORDER BY count DESC LIMIT 6
      `, [req.params.id]),

      pool.query(`
        SELECT booking_date::text AS date,
               COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed
        FROM bookings
        WHERE stadium_id=$1 AND booking_date >= CURRENT_DATE - 29
        GROUP BY booking_date ORDER BY booking_date
      `, [req.params.id])
    ]);

    const s = summaryRes.rows[0];
    res.json({
      thisMonth: {
        confirmed:  parseInt(s.month_confirmed),
        pending:    parseInt(s.pending_now),
        cancelled:  parseInt(s.month_cancelled),
        revenue:    Math.round(parseFloat(s.month_hours)  * pricePerHour)
      },
      allTime: {
        confirmed: parseInt(s.total_confirmed),
        revenue:   Math.round(parseFloat(s.total_hours) * pricePerHour)
      },
      byDow:        dowRes.rows,
      popularHours: hoursRes.rows,
      last30Days:   trendRes.rows
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
