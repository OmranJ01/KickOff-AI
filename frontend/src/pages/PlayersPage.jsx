import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";


function PlayerProfileModal({ playerId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall(`/players/${playerId}/profile`)
      .then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, [playerId]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">{profile?.name || '…'}</h2>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          {loading ? (
            <div className="center-spinner"><span className="spinner large" /></div>
          ) : !profile ? (
            <div className="empty-state"><p>Failed to load profile</p></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <Avatar name={profile.name} src={profile.avatar_url} size={72} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.name}</div>
                  {[profile.city, profile.country].filter(Boolean).join(', ') && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <IconMapPin /> {[profile.city, profile.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {profile.stats?.top_position && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
                        {profile.stats.top_position}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {profile.bio && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontStyle: 'italic' }}>
                  "{profile.bio}"
                </div>
              )}

              {profile.stats?.matches_played > 0 && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Matches', value: profile.stats.matches_played, color: '#60a5fa' },
                    { label: 'Goals',   value: profile.stats.total_goals,    color: '#4ade80' },
                    { label: 'Assists', value: profile.stats.total_assists,  color: '#fb923c' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Friends · {profile.friends?.length || 0}
                </div>
                {profile.friends?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {profile.friends.map(f => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, fontSize: 13 }}>
                        <Avatar name={f.name} src={f.avatar_url} size={22} />
                        <span>{f.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No friends yet</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player, currentUserId, onAction, actionLoading, onViewAvailability, onViewProfile }) {
  const { id, name, city, country, friendship_status, friendship_requester, has_availability } = player;
  const isFriend = friendship_status==="accepted";
  const isPendingFromMe = friendship_status==="pending"&&Number(friendship_requester)===currentUserId;
  const isPendingToMe = friendship_status==="pending"&&Number(friendship_requester)!==currentUserId;
  const locationStr = [city, country].filter(Boolean).join(', ');

  return (
    <div className="player-card">
      <div style={{ cursor: 'pointer' }} onClick={() => onViewProfile && onViewProfile(id)}>
        <Avatar name={name} src={player.avatar_url}/>
      </div>
      <div className="player-info">
        <span className="player-name" style={{ cursor: 'pointer' }} onClick={() => onViewProfile && onViewProfile(id)}>{name}</span>
        {locationStr&&<span className="player-meta"><IconMapPin/> {locationStr}</span>}
        {has_availability&&<span className="avail-badge">📅 Has availability</span>}
      </div>

      <div className="player-actions">
        {has_availability&&<button className="action-btn muted" style={{fontSize:11,padding:'5px 8px'}} onClick={()=>onViewAvailability&&onViewAvailability(player)}>Schedule</button>}
        {isFriend&&(<><span className="friend-badge">Friends</span><button className="action-btn danger" onClick={()=>onAction("remove",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<IconUserMinus/>}</button></>)}
        {isPendingFromMe&&(<button className="action-btn muted" onClick={()=>onAction("cancel",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><span>Pending</span><IconX/></>}</button>)}
        {isPendingToMe&&(<><button className="action-btn success" onClick={()=>onAction("accept",id,String(friendship_requester))} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><IconCheck/><span>Accept</span></>}</button><button className="action-btn danger-sm" onClick={()=>onAction("decline",id,String(friendship_requester))} disabled={actionLoading===id}><IconX/></button></>)}
        {!friendship_status&&(<button className="action-btn primary" onClick={()=>onAction("add",id)} disabled={actionLoading===id}>{actionLoading===id?<span className="spinner sm"/>:<><IconUserPlus/><span>Add</span></>}</button>)}
      </div>

    </div>
  );
}


// ── Player Availability Viewer (read-only) ─────────────────────
function PlayerAvailabilityModal({ player, onClose }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall(`/players/${player.id}/availability`).then(s => { setSlots(s); setLoading(false); }).catch(() => setLoading(false));
  }, [player.id]);

  const byDay = DAYS.map((_, i) => slots.filter(s => s.day_of_week === i));
  
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div><h2 className="modal-title">{player.name}'s Availability</h2><p style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>Weekly schedule</p></div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          {loading ? <div className="center-spinner"><span className="spinner large"/></div> : (
            <div className="avail-grid">
              {DAYS.map((day, i) => (
                <div key={i} className={`avail-day-row ${byDay[i].length ? 'has-slots' : 'empty-day'}`}>
                  <span className="avail-day-label">{day.slice(0,3)}</span>
                  <div className="avail-slots">
                    {byDay[i].length ? byDay[i].map((s,j) => (
                      <span key={j} className="avail-slot-chip">{s.slot_start.slice(0,5)} – {s.slot_end.slice(0,5)}</span>
                    )) : <span className="avail-none">Not available</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



// ── My Availability Manager ────────────────────────────────────
function MyAvailabilityModal({ onClose }) {
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const TIMES = [];
  for (let h = 6; h <= 23; h++) { TIMES.push(`${String(h).padStart(2,'0')}:00`); TIMES.push(`${String(h).padStart(2,'0')}:30`); }

  useEffect(() => {
    apiCall('/players/availability').then(data => {
      const map = {};
      data.forEach(s => {
        if (!map[s.day_of_week]) map[s.day_of_week] = [];
        map[s.day_of_week].push({ start: s.slot_start.slice(0,5), end: s.slot_end.slice(0,5) });
      });
      setSlots(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addSlot = (day) => {
    setSlots(prev => ({ ...prev, [day]: [...(prev[day]||[]), { start: '08:00', end: '10:00' }] }));
  };
  const removeSlot = (day, idx) => {
    setSlots(prev => { const arr = [...(prev[day]||[])]; arr.splice(idx,1); return { ...prev, [day]: arr }; });
  };
  const updateSlot = (day, idx, field, val) => {
    setSlots(prev => { const arr = [...(prev[day]||[])]; arr[idx] = { ...arr[idx], [field]: val }; return { ...prev, [day]: arr }; });
  };
  const saveDay = async (day) => {
    setSaving(day);
    try {
      const daySlots = (slots[day]||[]).map(s => ({ slot_start: s.start, slot_end: s.end }));
      await apiCall(`/players/availability/${day}`, 'PUT', { slots: daySlots });
    } catch {}
    setSaving(null);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div><h2 className="modal-title">My Availability</h2><p style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>Set when you're free to play each week</p></div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          {loading ? <div className="center-spinner"><span className="spinner large"/></div> : DAYS.map((day, i) => (
            <div key={i} className="avail-editor-day">
              <div className="avail-editor-header">
                <span className="avail-day-label">{day}</span>
                <div style={{display:'flex',gap:8}}>
                  <button className="action-btn primary" style={{fontSize:12,padding:'4px 10px'}} onClick={() => addSlot(i)}>+ Add slot</button>
                  <button className="action-btn success" style={{fontSize:12,padding:'4px 10px'}} onClick={() => saveDay(i)} disabled={saving===i}>
                    {saving===i ? <span className="spinner sm"/> : 'Save'}
                  </button>
                </div>
              </div>
              {(slots[i]||[]).length === 0 && <p className="avail-none" style={{marginLeft:8}}>No slots — not available</p>}
              {(slots[i]||[]).map((s, j) => (
                <div key={j} className="slot-row">
                  <select className="time-select" value={s.start} onChange={e => updateSlot(i,j,'start',e.target.value)}>
                    {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{color:'var(--text-muted)',fontSize:13}}>to</span>
                  <select className="time-select" value={s.end} onChange={e => updateSlot(i,j,'end',e.target.value)}>
                    {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="action-btn danger-sm" onClick={() => removeSlot(i,j)}><IconX/></button>
                </div>
              ))}
            </div>
          ))}
          <div className="modal-actions">
            <button className="submit-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}



function PlayersPage({ user }) {
  const [tab, setTab] = useState("search");
  const [filters, setFilters] = useState({ q: '', city: '', country: '', day: '' });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [viewAvailPlayer, setViewAvailPlayer] = useState(null);
  const [showMyAvail, setShowMyAvail] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);
  const debounceRef = useRef(null);

  const loadFriends = useCallback(async () => {
    try {
      const [f, inc, out] = await Promise.all([apiCall("/friends"), apiCall("/friends/requests/incoming"), apiCall("/friends/requests/outgoing")]);
      setFriends(f); setIncoming(inc); setOutgoing(out);
    } catch {}
  }, []);
  useEffect(() => { loadFriends(); }, [loadFriends]);

  const doSearch = useCallback(async (f) => {
    const params = new URLSearchParams();
    if (f.q) params.set('q', f.q);
    if (f.city) params.set('city', f.city);
    if (f.country) params.set('country', f.country);
    if (f.day !== '') params.set('day', f.day);
    setSearching(true); setHasSearched(true);
    try { setSearchResults(await apiCall(`/players/search?${params}`)); } catch {}
    setSearching(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(filters), 350);
  }, [filters, doSearch]);

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  const handleAction = async (action, targetId, requesterId) => {
    setActionLoading(targetId);
    try {
      if (action === "add") await apiCall("/friends/request", "POST", { addresseeId: targetId });
      else if (action === "cancel" || action === "remove") await apiCall(`/friends/${targetId}`, "DELETE");
      else if (action === "accept") await apiCall(`/friends/${requesterId}/respond`, "PATCH", { action: "accept" });
      else if (action === "decline") await apiCall(`/friends/${requesterId}/respond`, "PATCH", { action: "decline" });
      await loadFriends();
      doSearch(filters);
    } catch (err) { console.error(err); }
    setActionLoading(null);
  };

  const hasFilters = filters.q || filters.city || filters.country || filters.day !== '';

  return (
    <div className="players-page">
      <div className="sub-tabs">
        <button className={`sub-tab ${tab==="search"?"active":""}`} onClick={()=>setTab("search")}><IconSearch/> Search</button>
        <button className={`sub-tab ${tab==="friends"?"active":""}`} onClick={()=>setTab("friends")}><IconUsers/> Friends{friends.length>0&&<span className="count-badge neutral">{friends.length}</span>}</button>
        <button className={`sub-tab ${tab==="requests"?"active":""}`} onClick={()=>setTab("requests")}>Requests{incoming.length>0&&<span className="count-badge green">{incoming.length}</span>}</button>
        <button className={`sub-tab`} onClick={()=>setShowMyAvail(true)}>📅 My Availability</button>
      </div>

      {tab==="search" && (
        <div className="tab-content">
          {/* Filter bar */}
          <div className="player-filter-bar">
            <div className="search-bar" style={{flex:2,minWidth:160}}>
              <span className="search-icon"><IconSearch/></span>
              <input value={filters.q} onChange={e=>setFilter('q',e.target.value)} placeholder="Search by name..." />
              {searching && <span className="spinner sm" style={{position:'absolute',right:14}}/>}
            </div>
            <input className="filter-input" value={filters.country} onChange={e=>setFilter('country',e.target.value)} placeholder="🌍 Country"/>
            <input className="filter-input" value={filters.city} onChange={e=>setFilter('city',e.target.value)} placeholder="📍 City"/>
            <select className="filter-select" value={filters.day} onChange={e=>setFilter('day',e.target.value)}>
              <option value="">📅 Any day</option>
              {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
            </select>
            {hasFilters && <button className="action-btn muted" style={{fontSize:12,whiteSpace:'nowrap'}} onClick={()=>setFilters({q:'',city:'',country:'',day:''})}>Clear</button>}
          </div>
          {!hasSearched && <div className="empty-state"><div className="empty-icon"><IconSearch/></div><p>Filter players by name, country, city or availability day</p></div>}
          {hasSearched && !searching && searchResults.length===0 && <div className="empty-state"><div className="empty-icon"><IconUsers/></div><p>No players found</p></div>}
          <div className="player-list">
            {searchResults.map(p => <PlayerCard key={p.id} player={p} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading} onViewAvailability={setViewAvailPlayer} onViewProfile={setViewProfileId}/>)}
          </div>
        </div>
      )}
      {tab==="friends" && (<div className="tab-content">{friends.length===0?<div className="empty-state"><div className="empty-icon"><IconUsers/></div><p>No friends yet!</p></div>:<div className="player-list">{friends.map(f=><PlayerCard key={f.id} player={{...f,friendship_status:"accepted"}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading} onViewAvailability={setViewAvailPlayer} onViewProfile={setViewProfileId}/>)}</div>}</div>)}
      {tab==="requests" && (<div className="tab-content">
        {incoming.length>0&&<div className="requests-section"><h3 className="section-label">Incoming <span className="count-badge green">{incoming.length}</span></h3><div className="player-list">{incoming.map(p=><PlayerCard key={p.id} player={{...p,friendship_status:"pending",friendship_requester:p.id}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div></div>}
        {outgoing.length>0&&<div className="requests-section"><h3 className="section-label">Sent</h3><div className="player-list">{outgoing.map(p=><PlayerCard key={p.id} player={{...p,friendship_status:"pending",friendship_requester:user.id}} currentUserId={user.id} onAction={handleAction} actionLoading={actionLoading}/>)}</div></div>}
        {incoming.length===0&&outgoing.length===0&&<div className="empty-state"><div className="empty-icon"><IconClock/></div><p>No pending requests</p></div>}
      </div>)}
      {viewAvailPlayer && <PlayerAvailabilityModal player={viewAvailPlayer} onClose={()=>setViewAvailPlayer(null)}/>}
      {showMyAvail && <MyAvailabilityModal onClose={()=>setShowMyAvail(false)}/>}
      {viewProfileId && <PlayerProfileModal playerId={viewProfileId} onClose={()=>setViewProfileId(null)}/>}
    </div>
  );
}


export { PlayerProfileModal };
export default PlayersPage;
