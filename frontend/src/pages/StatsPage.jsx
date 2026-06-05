import { useState, useEffect } from "react";
import { apiCall, Avatar, IconBall, IconCalendar } from "../utils";

const IconGoal    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/></svg>;
const IconAssist  = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12l2 2 4-4"/></svg>;
const IconStar    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
const IconMatches = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
const IconSearch  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;

function StarBar({ rating, max = 10 }) {
  const pct = (rating / max) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#facc15,#f59e0b)', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#facc15', minWidth: 28 }}>{rating}</span>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${color}22`,
      borderRadius: 16, padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <div style={{ color, opacity: 0.7 }}>{icon}</div>
      </div>
      <span style={{ fontSize: String(value ?? '').length > 6 ? 20 : String(value ?? '').length > 3 ? 28 : 40, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px' }}>{value ?? '—'}</span>
      <div style={{ position: 'absolute', bottom: -16, right: -10, fontSize: 70, opacity: 0.04, color, pointerEvents: 'none' }}>{value ?? ''}</div>
    </div>
  );
}

/* ── AI Analysis History ─────────────────────────────────── */
const AI_STORAGE = (id) => `ai_analyst_history_${id}`;

function timeLabel(ts) {
  const d = new Date(ts), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `Today ${t}`;
  if (days === 1) return `Yesterday ${t}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ` · ${t}`;
}

function AIAnalystCard({ playerId }) {
  const key = AI_STORAGE(playerId);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  // quota hit = most recent entry is a quota error AND it happened TODAY
  const today = new Date().toDateString();
  const quotaHit = history.length > 0 &&
    history[0]?.isError &&
    history[0]?.text?.includes('quota') &&
    new Date(history[0].ts).toDateString() === today;

  useEffect(() => { localStorage.setItem(key, JSON.stringify(history.slice(0, 10))); }, [history, key]);
  useEffect(() => { try { setHistory(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setHistory([]); } setExpanded(null); }, [key]);

  const analyze = async () => {
    if (loading || quotaHit) return;
    setLoading(true);
    try {
      const res = await apiCall('/ai/analyze-stats', 'POST', { playerId });
      setHistory(prev => [{ text: res.analysis, ts: Date.now(), isError: false }, ...prev]);
      setExpanded(0);
    } catch (err) {
      const msg = err.message || '';
      const isQuota = msg.includes('quota') || msg.includes('429') || msg.includes('today');
      setHistory(prev => [{
        text: isQuota ? 'Daily quota reached. Free tier allows 200 AI requests/day — resets at midnight.' : (msg || 'Analysis failed. Try again.'),
        ts: Date.now(), isError: true,
      }, ...prev]);
      setExpanded(0);
    }
    setLoading(false);
  };

  const successCount = history.filter(h => !h.isError).length;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid rgba(74,222,128,0.2)',
      borderRadius: 18, marginBottom: 28, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', flexWrap: 'wrap', gap: 10,
        background: 'linear-gradient(135deg,rgba(74,222,128,0.07),rgba(96,165,250,0.05))',
        borderBottom: history.length > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🤖</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              AI Performance Analyst
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>Gemini</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {successCount === 0 ? 'No analyses yet' : `${successCount} analys${successCount === 1 ? 'is' : 'es'} saved`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {history.length > 0 && (
            <button onClick={() => { if (window.confirm('Clear all history?')) { setHistory([]); localStorage.removeItem(key); setExpanded(null); } }}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 11 }}>
              Clear all
            </button>
          )}
          <button onClick={analyze} disabled={loading || quotaHit} style={{
            background: loading || quotaHit ? 'rgba(255,255,255,0.05)' : 'rgba(74,222,128,0.15)',
            border: `1px solid ${loading || quotaHit ? 'rgba(255,255,255,0.08)' : 'rgba(74,222,128,0.35)'}`,
            color: loading || quotaHit ? 'var(--text-muted)' : '#4ade80',
            borderRadius: 10, padding: '8px 16px', cursor: loading || quotaHit ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
          }}>
            {loading ? <><span className="spinner sm" /> Analysing…</> : quotaHit ? '⏳ Quota hit' : '✨ Analyse My Stats'}
          </button>
        </div>
      </div>

      {/* Loading row */}
      {loading && (
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="spinner sm" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Gemini is analysing your stats…</span>
        </div>
      )}

      {/* History list */}
      {history.length > 0 && (
        <div>
          {history.map((entry, i) => (
            <div key={entry.ts} style={{ borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              {/* Collapsed row */}
              <div
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                  cursor: 'pointer', userSelect: 'none',
                  background: expanded === i ? 'rgba(74,222,128,0.04)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: entry.isError ? '#f87171' : '#4ade80' }} />
                <span style={{ flex: 1, fontSize: 13, color: entry.isError ? '#f87171' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.text.slice(0, 90)}{entry.text.length > 90 ? '…' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, marginRight: 4 }}>{timeLabel(entry.ts)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{expanded === i ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {expanded === i && (
                <div style={{ padding: '4px 18px 14px 38px' }}>
                  <div style={{
                    fontSize: 13, lineHeight: 1.8,
                    color: entry.isError ? '#f87171' : 'var(--text)',
                    background: entry.isError ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.04)',
                    border: `1px solid ${entry.isError ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.12)'}`,
                    borderLeft: `3px solid ${entry.isError ? '#f87171' : '#4ade80'}`,
                    borderRadius: 10, padding: '14px 16px', marginBottom: 8,
                  }}>
                    {entry.text.split('\n').map((line, i) => {
                      const isHeader = line.trim().length > 0 && line.trim().length < 40 && !line.trim().match(/^\d\./);
                      return (
                        <span key={i}>
                          {isHeader
                            ? <strong style={{ color: '#4ade80', display: 'block', marginTop: i > 0 ? 12 : 0, marginBottom: 4 }}>{line}</strong>
                            : <span>{line}{i < entry.text.split('\n').length - 1 ? <br/> : null}</span>
                          }
                        </span>
                      );
                    })}
                  </div>
                  <button onClick={() => { setHistory(prev => prev.filter((_, idx) => idx !== i)); setExpanded(null); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                    🗑 Remove this entry
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && !loading && (
        <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Click <strong style={{ color: '#4ade80' }}>✨ Analyse My Stats</strong> to get an AI-powered breakdown. Results are saved here.
        </div>
      )}
    </div>
  );
}

/* ── Timeline match entry ─────────────────────────────────── */
function TimelineMatch({ m, isLast }) {
  const scoreA = Number(m.score_a), scoreB = Number(m.score_b);
  const result = scoreA > scoreB ? 'W' : scoreA < scoreB ? 'L' : 'D';
  const rc = result === 'W' ? '#4ade80' : result === 'L' ? '#f87171' : '#facc15';
  const dateStr = new Date(m.played_on).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="timeline-entry">
      {/* Left — dot + line */}
      <div className="timeline-left">
        <div className="timeline-dot" style={{ background: rc, boxShadow: `0 0 10px ${rc}66` }} />
        {!isLast && <div className="timeline-line" />}
      </div>

      {/* Right — card */}
      <div className="timeline-card">
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="timeline-result-badge" style={{ background: `${rc}18`, border: `1px solid ${rc}44`, color: rc }}>{result}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{m.group_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{dateStr}</div>
          </div>
          <div className="timeline-score" style={{ color: rc }}>
            {scoreA} <span style={{ opacity: 0.4, fontSize: 18 }}>–</span> {scoreB}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: (m.notes_good || m.notes_bad || m.rating) ? 10 : 0 }}>
          {m.position && <span className="timeline-chip" style={{ color: '#c084fc', borderColor: 'rgba(192,132,252,0.3)', background: 'rgba(192,132,252,0.08)' }}>📍 {m.position}</span>}
          <span className="timeline-chip" style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)' }}>⚽ {m.goals} goal{m.goals !== 1 ? 's' : ''}</span>
          <span className="timeline-chip" style={{ color: '#fb923c', borderColor: 'rgba(251,146,60,0.3)', background: 'rgba(251,146,60,0.08)' }}>🎯 {m.assists} assist{m.assists !== 1 ? 's' : ''}</span>
          {m.rating && <span className="timeline-chip" style={{ color: '#facc15', borderColor: 'rgba(250,204,21,0.3)', background: 'rgba(250,204,21,0.08)' }}>★ {m.rating}/10</span>}
        </div>

        {/* Rating bar */}
        {m.rating && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(m.rating / 10) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${rc}, ${rc}aa)`, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          </div>
        )}

        {/* AI notes */}
        {(m.notes_good || m.notes_bad) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {m.notes_good && (
              <div style={{ display: 'flex', gap: 7, fontSize: 12, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.12)', borderLeft: '3px solid #4ade80', borderRadius: '0 8px 8px 0', padding: '6px 10px' }}>
                <span style={{ flexShrink: 0 }}>✅</span><span style={{ color: 'var(--text)', opacity: 0.85, lineHeight: 1.4 }}>{m.notes_good}</span>
              </div>
            )}
            {m.notes_bad && (
              <div style={{ display: 'flex', gap: 7, fontSize: 12, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.12)', borderLeft: '3px solid #f87171', borderRadius: '0 8px 8px 0', padding: '6px 10px' }}>
                <span style={{ flexShrink: 0 }}>🔧</span><span style={{ color: 'var(--text)', opacity: 0.85, lineHeight: 1.4 }}>{m.notes_bad}</span>
              </div>
            )}
          </div>
        )}
        {m.notes && !m.notes_good && !m.notes_bad && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>"{m.notes}"</div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */
export default function StatsPage({ user }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [playerId, setPlayerId] = useState('me');
  const [searchName, setSearchName] = useState('');
  const [friends, setFriends]   = useState([]);

  useEffect(() => { apiCall('/friends').then(setFriends).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    apiCall(`/match-results/players/${playerId}/stats`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [playerId]);

  const { summary, recent } = data || {};
  const isMe = playerId === 'me';
  const displayName   = isMe ? user.name : friends.find(f => f.id === playerId)?.name || 'Player';
  const displayAvatar = isMe ? user.avatarUrl : friends.find(f => f.id === playerId)?.avatar_url;
  const filtered = friends.filter(f => f.name.toLowerCase().includes(searchName.toLowerCase()));
  const wins   = (recent || []).filter(m => Number(m.score_a) > Number(m.score_b)).length;
  const losses = (recent || []).filter(m => Number(m.score_a) < Number(m.score_b)).length;
  const draws  = (recent || []).filter(m => Number(m.score_a) === Number(m.score_b)).length;

  return (
    <div className="stadiums-page">
      <div style={{ marginBottom: 24 }}>
        <h2 className="page-title">Player Stats</h2>
        <p className="page-sub">Match history &amp; performance analytics</p>
      </div>

      {/* Player selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px' }}>
        <button className={`sub-tab${isMe ? ' active' : ''}`} onClick={() => setPlayerId('me')} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Avatar name={user.name} src={user.avatarUrl} size={20} /> Me
        </button>
        {friends.length > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Friends</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}><IconSearch /></span>
              <input value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="Search…"
                style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none', width: 110 }} />
            </div>
            {filtered.slice(0, 8).map(f => (
              <button key={f.id} className={`sub-tab${playerId === f.id ? ' active' : ''}`} onClick={() => setPlayerId(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Avatar name={f.name} src={f.avatar_url} size={20} />{f.name.split(' ')[0]}
              </button>
            ))}
          </>
        )}
      </div>

      {loading && <div className="center-spinner" style={{ padding: 80 }}><span className="spinner large" /></div>}

      {!loading && data && (
        <>
          {/* Profile strip */}
          <div style={{ background: 'linear-gradient(135deg,rgba(74,222,128,0.08),rgba(96,165,250,0.05))', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 18, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Avatar name={displayName} src={displayAvatar} size={54} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{displayName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                {summary?.matches_played || 0} matches{summary?.top_position ? ` · ${summary.top_position}` : ''}
              </div>
            </div>
            {(summary?.matches_played || 0) > 0 && (
              <div style={{ display: 'flex', gap: 14 }}>
                {[['W', wins, '#4ade80'], ['D', draws, '#facc15'], ['L', losses, '#f87171']].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Analyst */}
          {isMe && <AIAnalystCard playerId={user.id} />}

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14, marginBottom: 28 }}>
            <StatCard label="Matches"      value={summary?.matches_played}   icon={<IconMatches />} color="#4ade80" />
            <StatCard label="Goals"        value={summary?.total_goals}      icon={<IconGoal />}    color="#60a5fa" />
            <StatCard label="Assists"      value={summary?.total_assists}    icon={<IconAssist />}  color="#fb923c" />
            <StatCard label="Position"     value={summary?.top_position ?? '—'} icon={<IconStar />} color="#facc15" />
          </div>

          {/* Match Timeline */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 className="section-title" style={{ margin: 0 }}>{isMe ? 'Match Timeline' : `${displayName}'s Matches`}</h3>
            {(recent || []).length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(recent || []).length} matches</span>}
          </div>

          {(recent || []).length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><IconCalendar /></div>
              <p>{isMe ? 'No matches logged yet — your group admin can add results.' : 'No matches logged yet.'}</p>
            </div>
          ) : (() => {
            // Group by month
            const byMonth = {};
            (recent || []).forEach(m => {
              const key = new Date(m.played_on).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
              if (!byMonth[key]) byMonth[key] = [];
              byMonth[key].push(m);
            });
            // Current streak
            let streak = 0, streakType = null;
            for (const m of (recent || [])) {
              const r = Number(m.score_a) > Number(m.score_b) ? 'W' : Number(m.score_a) < Number(m.score_b) ? 'L' : 'D';
              if (streakType === null) { streakType = r; streak = 1; }
              else if (r === streakType) streak++;
              else break;
            }
            const streakEmoji = streakType === 'W' ? '🔥' : streakType === 'L' ? '❄️' : '➖';
            const streakColor = streakType === 'W' ? '#4ade80' : streakType === 'L' ? '#f87171' : '#facc15';
            const streakLabel = streakType === 'W' ? 'win' : streakType === 'L' ? 'loss' : 'draw';
            return (
              <div>
                {streak >= 2 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: `${streakColor}10`, border: `1px solid ${streakColor}30`, borderRadius: 99, marginBottom: 24, fontSize: 13, fontWeight: 600, color: streakColor }}>
                    <span style={{ fontSize: 18 }}>{streakEmoji}</span>
                    {streak} game {streakLabel} streak
                  </div>
                )}
                {Object.entries(byMonth).map(([month, matches]) => (
                  <div key={month}>
                    <div className="timeline-month-label">{month}</div>
                    {matches.map((m, i) => {
                      const allMatches = Object.values(byMonth).flat();
                      const globalIdx = allMatches.indexOf(m);
                      return <TimelineMatch key={i} m={m} isLast={globalIdx === allMatches.length - 1} />;
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {!loading && !data && (
        <div className="empty-state"><div className="empty-icon"><IconBall /></div><p>Could not load stats.</p></div>
      )}
    </div>
  );
}
