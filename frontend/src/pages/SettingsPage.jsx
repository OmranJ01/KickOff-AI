import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
function SettingsPage({ user, onAvatarChange, onLogout, isOwner }) {
  const [activeSection, setActiveSection] = useState('profile');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(null);
  const [bio, setBio] = useState(user.bio || '');
  const [bioSaving, setBioSaving] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);

  const saveBio = async () => {
    setBioSaving(true);
    try {
      await apiCall('/auth/bio', 'PATCH', { bio });
      onAvatarChange({ bio });
      setBioSaved(true);
      setTimeout(() => setBioSaved(false), 2500);
    } catch (err) { alert('Failed to save: ' + err.message); }
    setBioSaving(false);
  };

  // ── Avatar upload ──────────────────────────────────────────────
  const handleAvatarFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Max 8MB'); return; }
    setUploading(true); setUploadSuccess(false);
    const compress = (f) => new Promise(resolve => {
      const img = new Image(); const url = URL.createObjectURL(f);
      img.onload = () => {
        let { width: w, height: h } = img;
        const max = 480;
        if (w > max || h > max) { const r = Math.min(max/w, max/h); w = Math.round(w*r); h = Math.round(h*r); }
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = url;
    });
    try {
      const compressed = await compress(file);
      const res = await apiCall('/auth/avatar', 'PUT', { imageBase64: compressed });
      onAvatarChange({ avatarUrl: res.avatarUrl });
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploading(false);
  };

  const handleRemoveAvatar = async () => {
    if (!window.confirm('Remove your profile photo?')) return;
    try {
      await apiCall('/auth/avatar', 'PUT', { imageBase64: null });
      onAvatarChange({ avatarUrl: null });
    } catch (err) { alert('Failed: ' + err.message); }
  };

  const sections = isOwner
    ? [{ id: 'profile', label: 'Profile Photo', icon: '📷' }, { id: 'account', label: 'Account', icon: '⚙️' }]
    : [{ id: 'profile', label: 'Profile Photo', icon: '📷' }, { id: 'availability', label: 'Availability', icon: '📅' }, { id: 'account', label: 'Account', icon: '⚙️' }];

  return (
    <div className="settings-root">
      {zoomPhoto && <PhotoZoomModal name={zoomPhoto.name} src={zoomPhoto.src} onClose={() => setZoomPhoto(null)}/>}
      {showDeleteAccount && <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} onDeleted={onLogout}/>}

      <div className="settings-layout">
        {/* ── Sidebar ── */}
        <aside className="settings-sidebar">
          <div className="settings-profile-mini">
            <div style={{position:'relative',cursor:'pointer'}} onClick={() => user.avatarUrl && setZoomPhoto({name: user.name, src: user.avatarUrl})}>
              <Avatar name={user.name} src={user.avatarUrl} size={64}/>
            </div>
            <div>
              <div className="settings-username">{user.name}</div>
              <div className="settings-useremail">{user.email}</div>
              <div className={`user-badge ${isOwner ? 'owner' : 'player'}`} style={{marginTop:6,fontSize:11,padding:'3px 8px'}}>
                {isOwner ? '🏟️ Stadium Owner' : '⚽ Player'}
              </div>
            </div>
          </div>

          <nav className="settings-nav">
            {sections.map(s => (
              <button key={s.id}
                className={`settings-nav-item ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setActiveSection(s.id)}>
                <span className="settings-nav-icon">{s.icon}</span>
                <span>{s.label}</span>
                {activeSection === s.id && <span style={{marginLeft:'auto',color:'var(--green)',fontSize:10}}>▶</span>}
              </button>
            ))}
          </nav>

          <button className="settings-logout-btn" onClick={onLogout}>
            <IconLogout /> Sign Out
          </button>
        </aside>

        {/* ── Main content ── */}
        <main className="settings-main">

          {/* ── Profile Photo section ── */}
          {activeSection === 'profile' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2 className="settings-section-title">Profile Photo</h2>
                <p className="settings-section-sub">Your photo appears in chats, the players list, and group members.</p>
              </div>

              <div className="settings-avatar-area">
                <div style={{position:'relative'}}>
                  <div
                    style={{cursor: user.avatarUrl ? 'zoom-in' : 'default'}}
                    onClick={() => user.avatarUrl && setZoomPhoto({name: user.name, src: user.avatarUrl})}>
                    <Avatar name={user.name} src={user.avatarUrl} size={120}/>
                  </div>
                  {uploading && (
                    <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'rgba(0,0,0,0.55)',
                      display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span className="spinner" style={{borderTopColor:'#fff'}}/>
                    </div>
                  )}
                  {uploadSuccess && (
                    <div style={{position:'absolute',bottom:4,right:4,width:28,height:28,borderRadius:'50%',
                      background:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center',
                      boxShadow:'0 2px 8px rgba(0,0,0,0.4)'}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#041a09" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                </div>

                <div className="settings-avatar-actions">
                  <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:16,lineHeight:1.6}}>
                    Upload a clear photo of your face so teammates can recognize you.<br/>
                    JPEG, PNG or WebP · Max 8MB
                  </p>
                  <input id="settings-avatar-input" type="file" accept="image/jpeg,image/png,image/webp"
                    style={{display:'none'}} onChange={handleAvatarFile}/>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <button className="submit-btn" style={{width:'auto',padding:'10px 24px'}}
                      onClick={() => document.getElementById('settings-avatar-input').click()}
                      disabled={uploading}>
                      {uploading
                        ? <><span className="spinner sm"/> Uploading…</>
                        : uploadSuccess
                        ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Saved!</>
                        : '📷 ' + (user.avatarUrl ? 'Change Photo' : 'Upload Photo')
                      }
                    </button>
                    {user.avatarUrl && (
                      <button className="btn-secondary" style={{padding:'10px 20px'}} onClick={handleRemoveAvatar}>
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* How your photo looks in the app */}
              <div className="settings-preview-card">
                <p className="settings-preview-label">Preview — how others see you</p>
                <div className="settings-preview-row">
                  <div className="settings-preview-item">
                    <Avatar name={user.name} src={user.avatarUrl} size={42}/>
                    <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Chat list</span>
                  </div>
                  <div className="settings-preview-item">
                    <Avatar name={user.name} src={user.avatarUrl} size={30}/>
                    <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Messages</span>
                  </div>
                  <div className="settings-preview-item">
                    <Avatar name={user.name} src={user.avatarUrl} size={56}/>
                    <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Profile</span>
                  </div>
                  <div className="settings-preview-item">
                    <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--bg2)',
                      border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px'}}>
                      <Avatar name={user.name} src={user.avatarUrl} size={34}/>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{user.name}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>Hey! Ready to play? ⚽</div>
                      </div>
                    </div>
                    <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Message bubble</span>
                  </div>
                </div>
              </div>

              {/* Bio editor */}
              <div style={{ marginTop: 32 }}>
                <div className="settings-section-header" style={{ marginBottom: 12 }}>
                  <h2 className="settings-section-title" style={{ fontSize: 16 }}>Bio</h2>
                  <p className="settings-section-sub">Tell other players who you are. Shown on your public profile.</p>
                </div>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value.slice(0, 300))}
                  placeholder="e.g. Midfielder based in London, love 5-a-side, available weekends..."
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', minHeight: 80, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{bio.length}/300</span>
                  <button className="submit-btn" style={{ width: 'auto', padding: '8px 20px' }} onClick={saveBio} disabled={bioSaving}>
                    {bioSaving ? <><span className="spinner sm" /> Saving…</> : bioSaved ? '✓ Saved!' : 'Save Bio'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Availability section (players only) ── */}
          {activeSection === 'availability' && !isOwner && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2 className="settings-section-title">My Availability</h2>
                <p className="settings-section-sub">Set the days and times you're free to play. Other players can see this and invite you to matches.</p>
              </div>
              <AvailabilityEditor/>
            </div>
          )}

          {/* ── Account section ── */}
          {activeSection === 'account' && (
            <div className="settings-section">
              <div className="settings-section-header">
                <h2 className="settings-section-title">Account</h2>
                <p className="settings-section-sub">Manage your account details and data.</p>
              </div>

              <div className="settings-info-card">
                <div className="settings-info-row">
                  <span className="settings-info-label">Full Name</span>
                  <span className="settings-info-value">{user.name}</span>
                </div>
                <div className="settings-info-row">
                  <span className="settings-info-label">Email</span>
                  <span className="settings-info-value">{user.email}</span>
                </div>
                <div className="settings-info-row">
                  <span className="settings-info-label">Account Type</span>
                  <span className="settings-info-value">{isOwner ? 'Stadium Owner' : 'Player'}</span>
                </div>
                {user.city && <div className="settings-info-row">
                  <span className="settings-info-label">City</span>
                  <span className="settings-info-value">{user.city}</span>
                </div>}
                {user.country && <div className="settings-info-row">
                  <span className="settings-info-label">Country</span>
                  <span className="settings-info-value">{user.country}</span>
                </div>}
              </div>

              <div className="settings-danger-card">
                <div>
                  <div style={{fontWeight:600,color:'#f87171',marginBottom:4}}>Delete Account</div>
                  <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.5}}>
                    Permanently removes your profile, all data, messages, {isOwner ? 'stadiums, and bookings.' : 'bookings, and friend connections.'}
                  </div>
                </div>
                <button className="action-btn danger" style={{whiteSpace:'nowrap',padding:'10px 20px',fontSize:13}}
                  onClick={() => setShowDeleteAccount(true)}>
                  <IconTrash/> Delete Account
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Availability Editor (inline, no modal) ─────────────────────────
function AvailabilityEditor() {
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);
  const TIMES = [];
  for (let h = 6; h <= 23; h++) { TIMES.push(`${String(h).padStart(2,'0')}:00`); TIMES.push(`${String(h).padStart(2,'0')}:30`); }

  useEffect(() => {
    apiCall('/players/availability').then(data => {
      const map = {};
      data.forEach(s => {
        if (!map[s.day_of_week]) map[s.day_of_week] = [];
        map[s.day_of_week].push({ start: s.slot_start.slice(0,5), end: s.slot_end.slice(0,5) });
      });
      setSlots(map); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const addSlot = (day) => setSlots(prev => ({ ...prev, [day]: [...(prev[day]||[]), { start: '08:00', end: '10:00' }] }));
  const removeSlot = (day, idx) => setSlots(prev => { const arr = [...(prev[day]||[])]; arr.splice(idx,1); return { ...prev, [day]: arr }; });
  const updateSlot = (day, idx, field, val) => setSlots(prev => { const arr = [...(prev[day]||[])]; arr[idx] = { ...arr[idx], [field]: val }; return { ...prev, [day]: arr }; });

  const saveDay = async (day) => {
    setSaving(day); setSaved(null);
    try {
      const daySlots = (slots[day]||[]).map(s => ({ slot_start: s.start, slot_end: s.end }));
      await apiCall(`/players/availability/${day}`, 'PUT', { slots: daySlots });
      setSaved(day); setTimeout(() => setSaved(null), 2500);
    } catch {}
    setSaving(null);
  };

  if (loading) return <div className="center-spinner"><span className="spinner large"/></div>;

  return (
    <div className="avail-editor-wrap">
      {DAYS.map((day, i) => {
        const daySlots = slots[i] || [];
        const hasSlots = daySlots.length > 0;
        return (
          <div key={i} className={`avail-editor-day-card ${hasSlots ? 'has-slots' : ''}`}>
            <div className="avail-editor-day-header">
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div className={`avail-day-dot ${hasSlots ? 'active' : ''}`}/>
                <span className="avail-day-name">{day}</span>
                {hasSlots && <span className="avail-slot-count">{daySlots.length} slot{daySlots.length > 1 ? 's' : ''}</span>}
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                {saved === i && (
                  <span style={{fontSize:12,color:'var(--green)',display:'flex',alignItems:'center',gap:4}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>Saved
                  </span>
                )}
                <button className="action-btn success" style={{fontSize:12,padding:'5px 12px'}}
                  onClick={() => saveDay(i)} disabled={saving === i}>
                  {saving === i ? <span className="spinner sm"/> : 'Save'}
                </button>
                <button className="action-btn primary" style={{fontSize:12,padding:'5px 12px'}}
                  onClick={() => addSlot(i)}>+ Add</button>
              </div>
            </div>
            {daySlots.length === 0 && (
              <p style={{fontSize:13,color:'var(--text-muted)',margin:'8px 0 4px',fontStyle:'italic'}}>Not available — tap + Add to set times</p>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:8,marginTop: daySlots.length ? 10 : 0}}>
              {daySlots.map((s, j) => (
                <div key={j} className="slot-row">
                  <select className="time-select" value={s.start} onChange={e => updateSlot(i,j,'start',e.target.value)}>
                    {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{color:'var(--text-muted)',fontSize:13,flexShrink:0}}>→</span>
                  <select className="time-select" value={s.end} onChange={e => updateSlot(i,j,'end',e.target.value)}>
                    {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="action-btn danger-sm" style={{flexShrink:0}} onClick={() => removeSlot(i,j)}><IconX/></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  DELETE ACCOUNT MODAL
// ══════════════════════════════════════════════════════════════════
function DeleteAccountModal({ onClose, onDeleted }) {
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirm !== 'DELETE') { setError('Type DELETE to confirm'); return; }
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');
      localStorage.removeItem('token');
      onDeleted();
    } catch (err) { setError(err.message); setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: '#f87171' }}>Delete Account</h2>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <div className="modal-form">
          <div className="delete-account-warning">
            <p className="delete-warning-title">⚠️ This action is permanent and cannot be undone.</p>
            <p className="delete-warning-body">Deleting your account will permanently remove:</p>
            <ul className="delete-warning-list">
              <li>Your profile and all personal data</li>
              <li>All your bookings and messages</li>
              <li>Your friend connections</li>
              <li>Your group memberships and chats</li>
              <li>All your stadiums and their schedules</li>
            </ul>
          </div>
          <div className="field">
            <label>Type <strong style={{ color: '#f87171', fontFamily: 'monospace' }}>DELETE</strong> to confirm</label>
            <input
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="DELETE"
              style={{ borderColor: confirm === 'DELETE' ? 'rgba(248,113,113,0.5)' : undefined }}
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="submit-btn"
              style={{ flex: 1, background: confirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.3)', color: '#fff' }}
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : <><IconTrash /> Delete My Account</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export { SettingsPage, AvailabilityEditor, DeleteAccountModal };
