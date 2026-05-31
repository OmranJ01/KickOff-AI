const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const getAI = () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in .env');
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

// Model cascade — working models first, Gemini fallbacks after.
// Each model has its own separate daily quota.
const AI_MODELS = [
  'gemma-3-27b-it',
  'gemma-3-12b-it',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
];

const isQuotaError = (err) =>
  err.message?.includes('429') ||
  err.message?.includes('quota') ||
  err.message?.includes('Too Many Requests') ||
  err.status === 429;

// Try each model in order; skip to next on ANY error (quota or unavailable).
async function generateWithFallback(prompt) {
  const ai = getAI();
  let lastErr;
  for (const modelName of AI_MODELS) {
    try {
      const model = ai.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      console.warn(`[AI] ${modelName} failed (${err.message?.slice(0, 60)}) — trying next…`);
      lastErr = err;
    }
  }
  // All models exhausted
  throw lastErr;
}

const handleAiError = (err, res) => {
  if (err.message?.includes('GEMINI_API_KEY')) return res.status(503).json({ error: err.message });
  if (isQuotaError(err)) {
    return res.status(429).json({ error: 'All AI models have hit their daily quota. Free tier resets at midnight — try again then.' });
  }
  return null; // caller handles remaining errors
};

// ══════════════════════════════════════════════════════════════════
//  FEATURE 1: AI MATCH ANALYST
//  POST /api/ai/analyze-stats
//  Body: { playerId }  — playerId can be 'me' or a numeric ID
// ══════════════════════════════════════════════════════════════════
router.post('/analyze-stats', authenticate, async (req, res) => {
  try {
    const rawId = req.body.playerId;
    const playerId = (!rawId || rawId === 'me') ? req.user.id : parseInt(rawId);

    // Fetch player name
    const userRes = await pool.query('SELECT name FROM users WHERE id=$1', [playerId]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'Player not found' });
    const playerName = userRes.rows[0].name;

    // Fetch aggregated stats
    const summaryRes = await pool.query(
      `SELECT
         COUNT(DISTINCT pms.match_result_id)::int AS matches_played,
         COALESCE(SUM(pms.goals), 0)::int         AS total_goals,
         COALESCE(SUM(pms.assists), 0)::int       AS total_assists,
         MODE() WITHIN GROUP (ORDER BY pms.position) AS top_position
       FROM player_match_stats pms
       WHERE pms.player_id = $1`,
      [playerId]
    );

    // Fetch recent 8 matches with personal notes for deep analysis
    const recentRes = await pool.query(
      `SELECT mr.played_on, mr.score_a, mr.score_b,
              pms.goals, pms.assists, pms.position, pms.notes_good, pms.notes_bad,
              g.name AS group_name
       FROM player_match_stats pms
       JOIN match_results mr ON pms.match_result_id = mr.id
       JOIN groups g ON mr.group_id = g.id
       WHERE pms.player_id = $1
       ORDER BY mr.played_on DESC LIMIT 8`,
      [playerId]
    );

    const s = summaryRes.rows[0];

    if (!s.matches_played || s.matches_played === 0) {
      return res.json({ analysis: `${playerName} hasn't logged any match stats yet. Play some matches and log your performance to get an AI-powered analysis!` });
    }

    const recentLines = recentRes.rows.map((m, i) => {
      const result = m.score_a > m.score_b ? 'WIN' : m.score_a < m.score_b ? 'LOSS' : 'DRAW';
      const date = new Date(m.played_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      let line = `  Match ${i + 1} [${date}] ${result} (${m.score_a}–${m.score_b})`;
      line += ` | Goals: ${m.goals}, Assists: ${m.assists}`;
      if (m.position) line += ` | Position: ${m.position}`;
      if (m.notes_good) line += `\n    ✅ What went well: "${m.notes_good}"`;
      if (m.notes_bad)  line += `\n    ❌ What went wrong: "${m.notes_bad}"`;
      return line;
    }).join('\n\n');

    const hasNotes = recentRes.rows.some(m => m.notes_good || m.notes_bad);

    const prompt = `You are an elite football performance coach and analyst with 20 years of experience developing players at all levels. Your job is to give ${playerName} a deeply personalised, honest, and actionable performance review based on their match data and personal notes.

═══ PLAYER DATA ═══
Name: ${playerName}
Total Matches Logged: ${s.matches_played}
Total Goals: ${s.total_goals}
Total Assists: ${s.total_assists}
Most Played Position: ${s.top_position || 'Not recorded'}

═══ RECENT MATCH LOG (with personal notes) ═══
${recentLines}

═══ YOUR TASK ═══
Write a structured performance review with these EXACT sections. Be specific — reference the player's actual notes and numbers, not generic advice.

**Overall Performance Summary**
2-3 sentences summarising their overall level based on stats and results. Mention goal/assist rate, win rate, consistency.

**Key Strengths**
2-3 bullet points identifying genuine strengths. If they wrote positive notes, quote or reference them specifically. Back each point with data.

**Areas to Improve**
2-3 bullet points on specific weaknesses. Reference their own negative notes directly. Be honest but constructive.

**Concrete Action Plan**
3 specific, practical drills or habits they should do THIS WEEK to fix the weaknesses. Be precise — not "improve passing" but "practice 20-minute rondos to improve passing under pressure".

**Mental & Tactical Advice**
1-2 sentences on mindset or tactical awareness based on their patterns (positions played, win/loss pattern, notes).

${!hasNotes ? 'Note: This player has not yet added personal match notes. Encourage them to add "what went well" and "what went wrong" notes after each match for deeper analysis.\n' : ''}
FORMATTING RULES — strictly follow:
- No markdown symbols: no **, no *, no ##, no bullet dashes
- Use plain section headers on their own line (e.g. "Overall Performance Summary")
- Use numbered lists only for the Action Plan (1. 2. 3.)
- Write in clean flowing sentences everywhere else
- Tone: direct, honest, specific, like a real coach talking to a player face to face
- Total length: 200-300 words`;

    const analysis = await generateWithFallback(prompt);
    res.json({ analysis, playerName, summary: s });
  } catch (err) {
    console.error('AI analyze-stats error:', err.message);
    if (handleAiError(err, res)) return;
    res.status(500).json({ error: 'AI analysis failed. Try again shortly.' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  FEATURE 2: SMART STADIUM SEARCH
//  POST /api/ai/stadium-search
// ══════════════════════════════════════════════════════════════════
router.post('/stadium-search', authenticate, async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  try {
    const prompt = `You are an expert football stadium search assistant. Extract EVERY filter the user mentions and return ONLY a valid JSON object. Be aggressive — extract everything possible.

User query: "${query.trim()}"

AVAILABLE FILTER FIELDS (all optional):
- "q": string — keyword in stadium name or description
- "city": string — city name
- "country": string — country name
- "surface": EXACTLY one of: "grass" | "artificial" | "futsal" | "indoor"
  Surface aliases: turf/pitch/natural → "grass"; astro/astroturf/synthetic/rubber → "artificial"; 5-a-side/five-a-side/mini/small pitch → "futsal"; hall/sports hall/covered → "indoor"
- "day": integer 0–6 — Sunday=0 Monday=1 Tuesday=2 Wednesday=3 Thursday=4 Friday=5 Saturday=6
- "slot_start": string "HH:MM" — earliest acceptable time slot. Aliases: dawn=05:00 morning=08:00 mid-morning=10:00 noon=12:00 afternoon=14:00 evening=17:00 night=19:00 late=21:00 midnight=23:00
- "slot_end": string "HH:MM" — latest acceptable time slot end (use slot_start+1h if only one time given)
- "min_price": number — minimum price per hour (e.g. "at least 50", "from 50", "more than 50")
- "max_price": number — maximum price per hour (e.g. "under 200", "cheaper than 200", "max 200", "budget", "affordable" → use 100)
- "min_capacity": number — minimum player/seat capacity (e.g. "capacity bigger than 60000", "holds 200+", "large", "big" → 200, "huge" → 500)
- "max_capacity": number — maximum capacity (e.g. "small", "tiny" → 50, "medium" → 200, "capacity less than X", "under X capacity")
- "open_from": string "HH:MM" — stadium must open AT or BEFORE this time (e.g. "open from 6am" → "06:00")
- "open_until": string "HH:MM" — stadium must close AT or AFTER this time (e.g. "open until midnight" → "23:00", "late closing" → "22:00")
- "has_phone": true — stadium must have a contact phone number listed
- "min_rating": number 1–5 — minimum avg review rating (e.g. "well rated"/"good reviews" → 3.5, "top rated"/"highly rated" → 4, "best"/"excellent" → 4.5)
- "max_rating": number 1–5 — maximum avg review rating (rarely used)
- "sort_by": one of "price_asc" | "price_desc" | "rating" | "capacity_asc" | "capacity_desc" | "newest"
  Sort aliases: "cheapest"/"lowest price" → "price_asc"; "most expensive" → "price_desc"; "best rated"/"top rated" → "rating"; "biggest"/"largest capacity" → "capacity_desc"; "smallest capacity" → "capacity_asc"; "newest"/"latest" → "newest"
- "use_my_availability": true — ONLY when user says "matches my availability", "when I'm free", "fits my schedule", "suits me", "based on my free time"

RULES:
1. Extract ALL filters — never stop at just one
2. "between X and Y price" → set both min_price and max_price
3. "between X and Y capacity" → set both min_capacity and max_capacity
4. For ranges like "capacity between 100 and 200000" → min_capacity:100, max_capacity:200000
5. Prices and capacities can be any number from 1 to 999999
6. Combine availability with other filters freely: "cheap stadium when I'm free" → {max_price:100, use_my_availability:true}
7. If user asks to sort/order results, set sort_by
8. Only set has_phone:true if user specifically asks for phone/contact

EXAMPLES:
"stadium available sunday" → {"day":0}
"grass pitch friday evening" → {"surface":"grass","day":5,"slot_start":"17:00","slot_end":"18:00"}
"futsal court monday morning under 150" → {"surface":"futsal","day":1,"slot_start":"08:00","slot_end":"09:00","max_price":150}
"pitch with capacity bigger than 60000" → {"min_capacity":60000}
"capacity between 100 and 200000" → {"min_capacity":100,"max_capacity":200000}
"capacity between 1 and 200000" → {"min_capacity":1,"max_capacity":200000}
"large stadium in london under 300 per hour" → {"city":"london","min_capacity":200,"max_price":300}
"small cheap futsal open saturday night" → {"surface":"futsal","max_capacity":50,"day":6,"slot_start":"21:00","sort_by":"price_asc"}
"top rated artificial turf" → {"surface":"artificial","min_rating":4,"sort_by":"rating"}
"cheapest stadium with a phone number" → {"has_phone":true,"sort_by":"price_asc"}
"grass pitch open until 11pm" → {"surface":"grass","open_until":"23:00"}
"stadium open from 6am" → {"open_from":"06:00"}
"best reviewed futsal in paris" → {"surface":"futsal","city":"paris","min_rating":4,"sort_by":"rating"}
"price between 50 and 500" → {"min_price":50,"max_price":500}
"stadium that matches my availability" → {"use_my_availability":true}
"cheap grass pitch that fits my schedule" → {"surface":"grass","max_price":100,"use_my_availability":true}

Return {} only if query is completely unrelated to stadiums. Return ONLY the JSON object — no markdown, no explanation, no extra text.`;

    let raw = (await generateWithFallback(prompt))
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    let filters = {};
    try { filters = JSON.parse(raw); } catch { filters = {}; }

    // ── helper: build shared WHERE conditions from filters ─────────
    const buildConditions = (params, startIdx, includeAvailJoin = false) => {
      const conditions = ['s.is_active=TRUE'];
      if (includeAvailJoin) conditions.push('ss.is_available=TRUE');
      let idx = startIdx;

      if (filters.q)            { conditions.push(`(s.name ILIKE $${idx} OR s.description ILIKE $${idx} OR s.city ILIKE $${idx})`); params.push(`%${filters.q}%`); idx++; }
      if (filters.city)         { conditions.push(`s.city ILIKE $${idx}`); params.push(`%${filters.city}%`); idx++; }
      if (filters.country)      { conditions.push(`s.country ILIKE $${idx}`); params.push(`%${filters.country}%`); idx++; }
      if (filters.surface)      { conditions.push(`s.surface=$${idx}`); params.push(filters.surface); idx++; }
      if (filters.min_price != null) { conditions.push(`s.price_per_hour>=$${idx}`); params.push(Number(filters.min_price)); idx++; }
      if (filters.max_price != null) { conditions.push(`s.price_per_hour<=$${idx}`); params.push(Number(filters.max_price)); idx++; }
      if (filters.min_capacity != null) { conditions.push(`s.capacity>=$${idx}`); params.push(Number(filters.min_capacity)); idx++; }
      if (filters.max_capacity != null) { conditions.push(`s.capacity<=$${idx}`); params.push(Number(filters.max_capacity)); idx++; }
      if (filters.open_from)    { conditions.push(`s.open_time<=$${idx}::time`); params.push(filters.open_from); idx++; }
      if (filters.open_until)   { conditions.push(`s.close_time>=$${idx}::time`); params.push(filters.open_until); idx++; }
      if (filters.has_phone)    { conditions.push(`s.phone IS NOT NULL AND s.phone<>''`); }
      if (filters.min_rating != null) { conditions.push(`(SELECT AVG(r.rating) FROM stadium_reviews r WHERE r.stadium_id=s.id)>=$${idx}`); params.push(Number(filters.min_rating)); idx++; }
      if (filters.max_rating != null) { conditions.push(`(SELECT AVG(r.rating) FROM stadium_reviews r WHERE r.stadium_id=s.id)<=$${idx}`); params.push(Number(filters.max_rating)); idx++; }

      return { conditions, idx };
    };

    const ORDER_MAP = {
      price_asc:        's.price_per_hour ASC',
      price_desc:       's.price_per_hour DESC',
      rating:           '(SELECT AVG(r.rating) FROM stadium_reviews r WHERE r.stadium_id=s.id) DESC NULLS LAST',
      capacity_desc:    's.capacity DESC NULLS LAST',
      capacity_asc:     's.capacity ASC NULLS LAST',
      newest:           's.created_at DESC',
    };
    const orderClause = ORDER_MAP[filters.sort_by] || 's.created_at DESC';

    const SELECT_COLS = `DISTINCT s.*, u.name AS owner_name, u.avatar_url AS owner_avatar,
      (SELECT ROUND(AVG(r.rating),1) FROM stadium_reviews r WHERE r.stadium_id=s.id) AS avg_rating,
      (SELECT COUNT(*)::int FROM stadium_reviews r WHERE r.stadium_id=s.id) AS review_count`;

    // ── CASE 1: matches my availability ───────────────────────────
    if (filters.use_my_availability) {
      const availRes = await pool.query(
        `SELECT day_of_week, slot_start, slot_end FROM player_availability
         WHERE player_id=$1 ORDER BY day_of_week, slot_start`,
        [req.user.id]
      );

      if (!availRes.rows.length) {
        return res.json({
          stadiums: [], filters, mode: 'availability',
          message: "You haven't set your availability yet. Go to Settings → Availability to set your free times, then try again.",
        });
      }

      const params = [req.user.id];
      const { conditions } = buildConditions(params, 2, true);

      const stadiumRes = await pool.query(
        `SELECT ${SELECT_COLS}
         FROM stadiums s
         JOIN users u ON s.owner_id=u.id
         JOIN stadium_schedule ss ON ss.stadium_id=s.id
         JOIN player_availability pa ON pa.player_id=$1
           AND pa.day_of_week=ss.day_of_week
           AND pa.slot_start < ss.slot_end
           AND pa.slot_end > ss.slot_start
         WHERE ${conditions.join(' AND ')}
         ORDER BY ${orderClause} LIMIT 20`,
        params
      );

      const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const availSummary = availRes.rows.map(a =>
        `${DAYS_FULL[a.day_of_week]} ${String(a.slot_start).slice(0,5)}–${String(a.slot_end).slice(0,5)}`
      ).join(', ');

      return res.json({ stadiums: stadiumRes.rows, filters, mode: 'availability', availabilitySummary: availSummary });
    }

    // ── CASE 2: standard filter search ────────────────────────────
    const params = [];
    let { conditions, idx } = buildConditions(params, 1, false);

    // Schedule join (day + optional time slot)
    let joinClause = '';
    if (filters.day !== undefined && filters.day !== null) {
      joinClause = `JOIN stadium_schedule ss ON ss.stadium_id=s.id AND ss.day_of_week=$${idx} AND ss.is_available=TRUE`;
      params.push(Number(filters.day)); idx++;

      const slotS = filters.slot_start;
      const slotE = filters.slot_end;
      if (slotS) {
        joinClause += ` AND ss.slot_start<=$${idx}::time`;
        params.push(slotS); idx++;
      }
      if (slotE) {
        joinClause += ` AND ss.slot_end>=$${idx}::time`;
        params.push(slotE); idx++;
      }
    }

    const sql = `SELECT ${SELECT_COLS}
       FROM stadiums s JOIN users u ON s.owner_id=u.id ${joinClause}
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderClause} LIMIT 30`;

    const stadiumRes = await pool.query(sql, params);
    res.json({ stadiums: stadiumRes.rows, filters, mode: 'filters', query: query.trim() });

  } catch (err) {
    console.error('AI stadium-search error:', err.message);
    if (handleAiError(err, res)) return;
    res.status(500).json({ error: 'AI search failed. Try again shortly.' });
  }
});

// ══════════════════════════════════════════════════════════════════
//  FEATURE 3: AI TEAM BALANCER
//  POST /api/ai/team-balancer
//  Body: { groupId }
// ══════════════════════════════════════════════════════════════════
router.post('/team-balancer', authenticate, async (req, res) => {
  try {
    const { groupId } = req.body;
    if (!groupId) return res.status(400).json({ error: 'groupId is required' });

    // Verify membership
    const mem = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active'`,
      [groupId, req.user.id]
    );
    if (!mem.rows.length) return res.status(403).json({ error: 'Not a member' });

    // Fetch all active members with their aggregated stats
    const membersRes = await pool.query(
      `SELECT u.id, u.name,
         COUNT(DISTINCT pms.match_result_id)::int        AS matches_played,
         COALESCE(SUM(pms.goals),   0)::int              AS total_goals,
         COALESCE(SUM(pms.assists), 0)::int              AS total_assists,
         MODE() WITHIN GROUP (ORDER BY pms.position)     AS top_position
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN player_match_stats pms ON pms.player_id = u.id
       WHERE gm.group_id=$1 AND gm.status='active'
       GROUP BY u.id, u.name
       ORDER BY u.name`,
      [groupId]
    );

    const members = membersRes.rows;
    if (members.length < 2) return res.status(400).json({ error: 'Need at least 2 members to balance teams' });

    const playerLines = members.map(m => {
      let line = `- ${m.name} (id:${m.id}): `;
      if (m.matches_played > 0) {
        line += `${m.matches_played} matches, ${m.total_goals} goals, ${m.total_assists} assists`;
        if (m.top_position) line += `, usual position: ${m.top_position}`;
      } else {
        line += 'no stats recorded yet';
        if (m.top_position) line += `, preferred position: ${m.top_position}`;
      }
      return line;
    }).join('\n');

    const prompt = `You are an expert football team organiser. Split these ${members.length} players into two balanced teams for the most competitive match possible.

═══ PLAYERS ═══
${playerLines}

Return ONLY a raw JSON object — no markdown, no code fences, no extra text:
{
  "team_a": {
    "name": "Team A",
    "players": [{"id": <number>, "name": "<string>", "role": "<Forward|Midfielder|Defender|Goalkeeper|Winger>"}],
    "strength_notes": "<1-2 sentences on this team's strengths>"
  },
  "team_b": {
    "name": "Team B",
    "players": [{"id": <number>, "name": "<string>", "role": "<Forward|Midfielder|Defender|Goalkeeper|Winger>"}],
    "strength_notes": "<1-2 sentences on this team's strengths>"
  },
  "balance_explanation": "<2-3 sentences explaining how you balanced the teams and why the split is fair>"
}

RULES:
- Every player appears in exactly one team, no omissions, no duplicates
- Teams differ by at most 1 player (split ${Math.ceil(members.length / 2)} / ${Math.floor(members.length / 2)} if odd)
- Distribute goal-scoring and assist potential evenly
- Assign each player a realistic football role based on their stats and position history
- Use the exact integer IDs provided above`;

    const raw = await generateWithFallback(prompt);
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    let result;
    try { result = JSON.parse(cleaned); }
    catch { return res.status(500).json({ error: 'AI returned an invalid response. Please try again.' }); }

    res.json({ ...result, totalPlayers: members.length });
  } catch (err) {
    console.error('AI team-balancer error:', err.message);
    if (handleAiError(err, res)) return;
    res.status(500).json({ error: 'AI team balancing failed. Try again shortly.' });
  }
});

module.exports = router;
