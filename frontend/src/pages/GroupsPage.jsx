import { useState, useEffect, useCallback, useRef } from "react";
import { apiCall, DAYS, DAYS_SHORT, SURFACES, SURFACE_COLOR, STATUS_COLOR, STATUS_BG, toMin, fromMin, hoursInRange, computeFreeWindows, validEndTimes, validStartTimes, IconBall, IconStadium, IconLogout, IconSettings, IconEye, IconUsers, IconHome, IconSearch, IconCheck, IconX, IconUserPlus, IconUserMinus, IconMapPin, IconClock, IconPlus, IconEdit, IconTrash, IconCalendar, IconPhone, IconDollar, IconUsers2, IconToggle, IconFilter, IconBell, IconChat, IconGroup, IconSend, IconArrowLeft, IconShield, IconBookmark, IconArrow, Avatar, ImagePicker, PhotoZoomModal } from "../utils";
import socket from "../socket";
import { PlayerProfileModal } from "./PlayersPage";
function GroupsPage({ user, initialGroupId }) {
  const [tab, setTab] = useState('my');
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const didAutoOpen = useRef(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [g, inv] = await Promise.all([apiCall('/groups/mine'), apiCall('/groups/invites/pending')]);
      setGroups(g); setInvites(inv);
      if (initialGroupId && !didAutoOpen.current) {
        didAutoOpen.current = true;
        const target = g.find(x => x.id === Number(initialGroupId));
        if (target) setActiveGroup(target);
        else setTab('invites');
      }
    } catch {}
    setLoading(false);
  }, [initialGroupId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const respondInvite = async (groupId, action) => {
    try {
      await apiCall(`/groups/${groupId}/respond`, 'PATCH', { action });
      await loadGroups();
      if (action === 'accept') setTab('my');
    } catch {}
  };

  if (activeGroup) {
    return <GroupDetail group={activeGroup} user={user} onBack={() => { setActiveGroup(null); loadGroups(); }} />;
  }

  return (
    <div className="groups-page">
      <div className="stadiums-header">
        <div>
          <h2 className="page-title">Groups & Matches</h2>
          <p className="page-sub">Organize matches with your friends</p>
        </div>
        <button className="submit-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => setShowCreate(true)}>
          <IconPlus /> Create Group
        </button>
      </div>

      <div className="sub-tabs">
        <button className={`sub-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>
          <IconGroup /> My Groups {groups.length > 0 && <span className="count-badge neutral">{groups.length}</span>}
        </button>
        <button className={`sub-tab ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>
          Invites {invites.length > 0 && <span className="count-badge green">{invites.length}</span>}
        </button>
      </div>

      {loading && <div className="center-spinner" style={{ padding: 40 }}><span className="spinner large" /></div>}

      {!loading && tab === 'my' && (
        <div className="tab-content">
          {groups.length === 0 ? (
            <div className="empty-state large">
              <div className="empty-icon large"><IconGroup /></div>
              <p className="empty-title">No groups yet</p>
              <p>Create a group and invite friends to organize a match</p>
              <button className="cta-btn" style={{ marginTop: 16, width: 'auto' }} onClick={() => setShowCreate(true)}>
                <IconPlus /> Create Your First Group
              </button>
            </div>
          ) : (
            <div className="group-grid">
              {groups.map(g => (
                <div key={g.id} className="group-card" onClick={() => setActiveGroup(g)}>
                  <div className="group-card-header">
                    <div className="group-avatar"><IconGroup /></div>
                    <div>
                      <h3 className="group-name">{g.name}</h3>
                      <span className="group-meta">{g.member_count} player{g.member_count !== 1 ? 's' : ''}</span>
                    </div>
                    {g.unread_count > 0 && <span className="count-badge green" style={{ marginLeft: 'auto' }}>{g.unread_count}</span>}
                  </div>
                  {g.description && <p className="group-desc">{g.description}</p>}
                  <div className="group-details">
                    {g.stadium_name && <div className="stat"><IconStadium /><span>{g.stadium_name}</span></div>}
                    {g.match_day !== null && <div className="stat"><IconCalendar /><span>{DAYS[g.match_day]}{g.match_start ? ` · ${g.match_start?.slice(0,5)}` : ''}</span></div>}
                    <div className="stat"><IconUsers2 /><span>Max {g.max_players}</span></div>
                  </div>
                  {g.my_role === 'admin' && <span className="admin-badge"><IconShield /> Admin</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'invites' && (
        <div className="tab-content">
          {invites.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><IconGroup /></div><p>No pending invites</p></div>
          ) : (
            <div className="group-grid">
              {invites.map(g => (
                <div key={g.id} className="group-card invite-card">
                  <div className="group-card-header">
                    <div className="group-avatar"><IconGroup /></div>
                    <div>
                      <h3 className="group-name">{g.name}</h3>
                      <span className="group-meta">by {g.creator_name} · {g.member_count} members</span>
                    </div>
                  </div>
                  {g.description && <p className="group-desc">{g.description}</p>}
                  {g.stadium_name && <div className="stat" style={{ marginBottom: 12 }}><IconStadium /><span>{g.stadium_name}</span></div>}
                  <div className="group-invite-actions">
                    <button className="action-btn success" style={{ flex: 1 }} onClick={() => respondInvite(g.id, 'accept')}>
                      <IconCheck /> Accept
                    </button>
                    <button className="action-btn danger" onClick={() => respondInvite(g.id, 'decline')}>
                      <IconX />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadGroups(); }} />}
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1=details, 2=invite friends
  const [form, setForm] = useState({ name: '', description: '', match_day: '', match_start: '', match_end: '', max_players: '10' });
  const [stadiums, setStadiums] = useState([]);
  const [selectedStadium, setSelectedStadium] = useState('');
  const [friends, setFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdGroupId, setCreatedGroupId] = useState(null);

  useEffect(() => {
    Promise.all([apiCall('/stadiums'), apiCall('/friends')])
      .then(([s, f]) => { setStadiums(s); setFriends(f); })
      .catch(() => {});
  }, []);

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleFriend = (id) => {
    setSelectedFriends(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const createGroup = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const g = await apiCall('/groups', 'POST', {
        name: form.name, description: form.description || null,
        stadium_id: selectedStadium || null,
        match_day: form.match_day !== '' ? parseInt(form.match_day) : null,
        match_start: form.match_start || null, match_end: form.match_end || null,
        max_players: parseInt(form.max_players) || 10,
      });
      setCreatedGroupId(g.id);
      if (friends.length > 0) { setStep(2); }
      else { onCreated(); }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const sendInvites = async () => {
    setLoading(true);
    try {
      await Promise.all([...selectedFriends].map(fid =>
        apiCall(`/groups/${createdGroupId}/invite`, 'POST', { userId: fid })
      ));
    } catch {}
    setLoading(false);
    onCreated();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{step === 1 ? 'Create Group' : 'Invite Friends'}</h2>
            {step === 2 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Select who to invite — you can always invite more later</p>}
          </div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>

        {step === 1 && (
          <form onSubmit={createGroup} className="modal-form">
            <div className="field"><label>Group Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Friday Night FC" required /></div>
            <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handle} placeholder="Tell your friends what this group is about..." rows={2} /></div>
            <div className="field"><label>Stadium <span className="optional">(optional)</span></label>
              <select value={selectedStadium} onChange={e => setSelectedStadium(e.target.value)}>
                <option value="">No stadium selected</option>
                {stadiums.map(s => <option key={s.id} value={s.id}>{s.name} — {[s.city, s.country].filter(Boolean).join(', ')}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="field"><label>Match Day</label>
                <select name="match_day" value={form.match_day} onChange={handle}>
                  <option value="">Any day</option>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="field"><label>Max Players</label><input name="max_players" type="number" min="2" max="50" value={form.max_players} onChange={handle} /></div>
            </div>
            {form.match_day !== '' && (
              <div className="form-row">
                <div className="field"><label>Start Time</label><input name="match_start" type="time" value={form.match_start} onChange={handle} /></div>
                <div className="field"><label>End Time</label><input name="match_end" type="time" value={form.match_end} onChange={handle} /></div>
              </div>
            )}
            {error && <div className="error-msg">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={loading}>
                {loading ? <span className="spinner" /> : friends.length > 0 ? 'Next: Invite Friends →' : 'Create Group'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="modal-form">
            <div className="friend-picker-list">
              {friends.length === 0 && <div className="empty-state"><p>No friends to invite yet</p></div>}
              {friends.map(f => (
                <div
                  key={f.id}
                  className={`friend-picker-item ${selectedFriends.has(f.id) ? 'selected' : ''}`}
                  onClick={() => toggleFriend(f.id)}
                >
                  <Avatar name={f.name} size={38} />
                  <div className="player-info">
                    <span className="player-name">{f.name}</span>
                    {[f.city,f.country].filter(Boolean).join(', ') && <span className="player-meta"><IconMapPin /> {[f.city,f.country].filter(Boolean).join(', ')}</span>}
                  </div>
                  <div className={`friend-check ${selectedFriends.has(f.id) ? 'checked' : ''}`}>
                    {selectedFriends.has(f.id) && <IconCheck />}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => onCreated()}>Skip</button>
              <button className="submit-btn" style={{ flex: 1 }} onClick={sendInvites} disabled={loading}>
                {loading ? <span className="spinner" /> : selectedFriends.size > 0 ? `Invite ${selectedFriends.size} Friend${selectedFriends.size > 1 ? 's' : ''}` : 'Create Without Inviting'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupDetail({ group, user, onBack }) {
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [friends, setFriends] = useState([]);
  const [inviting, setInviting] = useState(null);
  const [invited, setInvited] = useState(new Set()); // track successfully invited
  const [showEdit, setShowEdit] = useState(false);
  const messagesEndRef = useRef(null);
  const [kicked, setKicked] = useState(false);
  const [teamBalance, setTeamBalance] = useState(null);
  const [balancing, setBalancing] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [viewProfileId, setViewProfileId] = useState(null);

  const loadDetail = useCallback(async () => {
    try { setDetail(await apiCall(`/groups/${group.id}`)); } catch {}
  }, [group.id]);

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await apiCall(`/groups/${group.id}/messages`));
    } catch (err) {
      if (err.message === 'Not a member') setKicked(true);
    }
  }, [group.id]);

  useEffect(() => {
    loadDetail();
    loadMessages();

    socket.emit('join_group', { groupId: group.id });

    const onGroupMessage = (msg) => {
      if (msg.sender_id !== user.id) {
        setMessages(prev => [...prev, msg]);
      }
    };
    const onKicked = ({ groupId }) => {
      if (groupId === group.id) setKicked(true);
    };

    socket.on('group_message', onGroupMessage);
    socket.on('kicked_from_group', onKicked);

    return () => {
      socket.emit('leave_group', { groupId: group.id });
      socket.off('group_message', onGroupMessage);
      socket.off('kicked_from_group', onKicked);
    };
  }, [loadDetail, loadMessages, group.id, user.id]);

  // Auto-exit when kicked
  useEffect(() => {
    if (kicked) {
      const t = setTimeout(() => onBack(), 3000);
      return () => clearTimeout(t);
    }
  }, [kicked, onBack]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'members') {
      apiCall('/friends').then(setFriends).catch(() => {});
    }
  }, [activeTab]);

  const [zoomPhoto, setZoomPhoto] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const holdTimerRef = useRef(null);

  const onHoldStart = (e, msg, isMe) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect(); // capture NOW before timeout
    holdTimerRef.current = setTimeout(() => {
      setCtxMenu({ msgId: msg.id, isMe, x: rect.left, y: rect.top });
    }, 500);
  };
  const onHoldEnd = () => clearTimeout(holdTimerRef.current);

  const deleteGroupMessage = async (msgId, scope) => {
    setCtxMenu(null);
    try {
      await apiCall(`/groups/${group.id}/messages/${msgId}`, 'DELETE', { scope });
      if (scope === 'me') {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      } else {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted_for_all: true, content: null } : m));
      }
    } catch (err) { alert(err.message); }
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiCall(`/groups/${group.id}/messages`, 'POST', { content: newMsg });
      setMessages(prev => [...prev, { ...msg, sender_name: user.name, sender_avatar: user.avatarUrl }]);
      setNewMsg('');
    } catch {}
    setSending(false);
  };

  const balanceTeams = async () => {
    setBalancing(true);
    setBalanceError('');
    try {
      const result = await apiCall('/ai/team-balancer', 'POST', { groupId: group.id });
      setTeamBalance(result);
    } catch (err) {
      setBalanceError(err.message || 'Failed to balance teams. Try again.');
    }
    setBalancing(false);
  };

  const inviteFriend = async (friendId) => {
    setInviting(friendId);
    try {
      await apiCall(`/groups/${group.id}/invite`, 'POST', { userId: friendId });
      setInvited(prev => new Set([...prev, friendId]));
    } catch {}
    setInviting(null);
  };

  const kickMember = async (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from the group?`)) return;
    try {
      await apiCall(`/groups/${group.id}/members/${memberId}`, 'DELETE');
      setDetail(prev => ({ ...prev, members: prev.members.filter(m => m.id !== memberId) }));
    } catch (e) { alert(e?.message || 'Failed to remove member'); }
  };

  const leaveGroup = async () => {
    if (!window.confirm('Leave this group?')) return;
    try { await apiCall(`/groups/${group.id}/leave`, 'DELETE'); onBack(); } catch {}
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isAdmin = detail?.members?.find(m => m.id === user.id)?.role === 'admin';
  const memberIds = new Set(detail?.members?.map(m => m.id) || []);

  // Use detail for live data, fall back to group prop
  const currentGroup = detail || group;

  return (
    <div className="group-detail">
      {kicked && (
        <div style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:12,padding:'14px 20px',margin:'16px',display:'flex',alignItems:'center',gap:12,color:'#f87171',fontWeight:600,fontSize:14}}>
          <span style={{fontSize:20}}>🚫</span>
          <div><div>You have been removed from this group.</div><div style={{fontWeight:400,fontSize:12,opacity:0.75,marginTop:2}}>Returning to groups list in a moment…</div></div>
        </div>
      )}
      <div className="group-detail-header">
        <button className="back-btn" onClick={onBack}><IconArrowLeft /></button>
        <div className="group-avatar sm"><IconGroup /></div>
        <div style={{ flex: 1 }}>
          <h2 className="group-name">{currentGroup.name}</h2>
          <span className="group-meta">{detail?.members?.length || 0} members</span>
        </div>
        {isAdmin && (
          <button className="action-btn primary" style={{ fontSize: 12 }} onClick={() => setShowEdit(true)}>
            <IconEdit /> Edit
          </button>
        )}
        <button className="action-btn danger" style={{ fontSize: 12 }} onClick={leaveGroup}>Leave</button>
      </div>

      {(currentGroup.stadium_name || currentGroup.match_day !== null) && (
        <div className="group-info-bar">
          {currentGroup.stadium_name && <span><IconStadium /> {currentGroup.stadium_name}</span>}
          {currentGroup.match_day !== null && <span><IconCalendar /> {DAYS[currentGroup.match_day]}{currentGroup.match_start ? ` · ${currentGroup.match_start?.slice(0,5)}` : ''}</span>}
          {currentGroup.max_players && <span><IconUsers2 /> Max {currentGroup.max_players}</span>}
        </div>
      )}

      <div className="sub-tabs" style={{ borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        <button className={`sub-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><IconChat /> Chat</button>
        <button className={`sub-tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}><IconUsers /> Members</button>
        <button className={`sub-tab ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}><IconCalendar /> Matches</button>
        <button className={`sub-tab ${activeTab === 'findtime' ? 'active' : ''}`} onClick={() => setActiveTab('findtime')}><IconClock /> Find Time</button>
      </div>

      {activeTab === 'chat' && (
        <div className="group-chat-area">
          {zoomPhoto && <PhotoZoomModal name={zoomPhoto.name} src={zoomPhoto.src} onClose={() => setZoomPhoto(null)}/>}
          {ctxMenu && (
            <div className="msg-ctx-menu" style={{position:'fixed',top:ctxMenu.y,left:ctxMenu.x,zIndex:9999}}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
              <button onClick={() => deleteGroupMessage(ctxMenu.msgId, 'me')}>🗑️ Delete for me</button>
              {ctxMenu.isMe && <button onClick={() => deleteGroupMessage(ctxMenu.msgId, 'all')} style={{color:'#f87171'}}>🗑️ Delete for everyone</button>}
            </div>
          )}
          <div className="messages-list" onClick={() => setCtxMenu(null)}>
            {messages.length === 0 && <div className="chat-empty-hint">Be the first to say something! 👋</div>}
            {messages.map((m, i) => {
              const isMe = m.sender_id === user.id;
              const showAvatar = !isMe && (i === 0 || messages[i-1]?.sender_id !== m.sender_id);
              const showMyAvatar = isMe && (i === messages.length - 1 || messages[i+1]?.sender_id !== m.sender_id);
              const showName = !isMe && showAvatar;
              const isDeleted = m.deleted_for_all;
              return (
                <div key={m.id} className={`message-row ${isMe ? 'me' : 'them'}`}>
                  {!isMe && (
                    showAvatar
                      ? <div style={{cursor:'pointer',flexShrink:0}} onClick={() => setZoomPhoto({ name: m.sender_name, src: m.sender_avatar })}>
                          <Avatar name={m.sender_name} src={m.sender_avatar} size={30}/>
                        </div>
                      : <div style={{width:30,flexShrink:0}}/>
                  )}
                  <div
                    className={`message-bubble${isDeleted ? ' deleted' : ''}`}
                    onMouseDown={!isDeleted ? (e) => onHoldStart(e, m, isMe) : undefined}
                    onMouseUp={onHoldEnd} onMouseLeave={onHoldEnd}
                    onTouchStart={!isDeleted ? (e) => onHoldStart(e, m, isMe) : undefined}
                    onTouchEnd={onHoldEnd}
                    style={!isDeleted ? {cursor:'context-menu'} : {}}
                  >
                    {showName && <span className="bubble-sender">{m.sender_name}</span>}
                    {isDeleted
                      ? <p style={{fontStyle:'italic',opacity:0.5,fontSize:13}}>🚫 This message was deleted</p>
                      : <p>{m.content}</p>
                    }
                    <span className="message-time">{formatTime(m.created_at)}</span>
                  </div>
                  {isMe && (
                    showMyAvatar
                      ? <div style={{cursor:'pointer',flexShrink:0}} onClick={() => setZoomPhoto({ name: user.name, src: user.avatarUrl })}>
                          <Avatar name={user.name} src={user.avatarUrl} size={30}/>
                        </div>
                      : <div style={{width:30,flexShrink:0}}/>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form className="message-input-row" onSubmit={sendMessage}>
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Message the group..." className="message-input" disabled={sending} />
            <button type="submit" disabled={!newMsg.trim() || sending}
              style={{
                flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
                background: !newMsg.trim() || sending ? 'rgba(96,165,250,0.2)' : '#3b82f6',
                border: 'none', cursor: !newMsg.trim() || sending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s', color: '#fff',
              }}>
              {sending ? <span className="spinner sm" /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="tab-content">
          {zoomPhoto && <PhotoZoomModal name={zoomPhoto.name} src={zoomPhoto.src} onClose={() => setZoomPhoto(null)}/>}

          {/* AI Team Balancer */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: teamBalance ? 16 : 0 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>⚡ AI Team Balancer</h3>
                {!teamBalance && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Generate two balanced teams from group members using their match stats</p>}
              </div>
              <button
                className="action-btn primary"
                style={{ fontSize: 12, flexShrink: 0, padding: '8px 16px' }}
                onClick={balanceTeams}
                disabled={balancing || (detail?.members?.length || 0) < 2}
                title={(detail?.members?.length || 0) < 2 ? 'Need at least 2 members' : ''}
              >
                {balancing ? <><span className="spinner sm" style={{ marginRight: 6 }} /> Balancing…</> : teamBalance ? '↻ Re-balance' : '⚡ Balance Teams'}
              </button>
            </div>
            {balanceError && <div className="error-msg" style={{ marginTop: 8 }}>{balanceError}</div>}
            {teamBalance && (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[teamBalance.team_a, teamBalance.team_b].map((team, ti) => {
                    const accent = ti === 0 ? '#4ade80' : '#60a5fa';
                    const accentBg = ti === 0 ? 'rgba(74,222,128,0.08)' : 'rgba(96,165,250,0.08)';
                    const accentBorder = ti === 0 ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.3)';
                    return (
                      <div key={ti} style={{ flex: '1 1 220px', background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 10, padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: accent }}>{team.name}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {(team.players || []).map((p, pi) => (
                            <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                              <Avatar name={p.name} size={26} />
                              <span style={{ flex: 1, fontWeight: 500 }}>{p.name}</span>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: accentBg, color: accent, border: `1px solid ${accentBorder}`, whiteSpace: 'nowrap' }}>
                                {p.role}
                              </span>
                            </div>
                          ))}
                        </div>
                        {team.strength_notes && (
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic', lineHeight: 1.55 }}>
                            {team.strength_notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {teamBalance.balance_explanation && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.12)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    🤖 {teamBalance.balance_explanation}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="player-list">
            {(detail?.members || []).map(m => (
              <div key={m.id} className="player-card">
                <div style={{cursor:'pointer'}} onClick={() => setZoomPhoto({ name: m.name, src: m.avatar_url })}>
                  <Avatar name={m.name} src={m.avatar_url} size={42}/>
                </div>
                <div className="player-info">
                  <span className="player-name" style={{cursor:'pointer'}} onClick={() => m.id !== user.id && setViewProfileId(m.id)}>
                    {m.name}{m.id === user.id ? ' (you)' : ''}
                  </span>
                  {[m.city,m.country].filter(Boolean).join(', ') && <span className="player-meta"><IconMapPin /> {[m.city,m.country].filter(Boolean).join(', ')}</span>}
                </div>
                {m.role === 'admin' && <span className="admin-badge"><IconShield /> Admin</span>}
                {isAdmin && m.id !== user.id && m.role !== 'admin' && (
                  <button
                    className="action-btn danger-sm"
                    onClick={() => kickMember(m.id, m.name)}
                    title={`Remove ${m.name}`}
                    style={{marginLeft:'auto',padding:'6px 12px',fontSize:12,background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)',color:'#f87171',borderRadius:8,cursor:'pointer',flexShrink:0}}
                  >
                    ✕ Kick
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && friends.filter(f => !memberIds.has(f.id)).length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 className="section-label">Invite Friends</h3>
              <div className="player-list">
                {friends.filter(f => !memberIds.has(f.id)).map(f => (
                  <div key={f.id} className="player-card">
                    <div style={{cursor:'pointer'}} onClick={() => setZoomPhoto({ name: f.name, src: f.avatar_url })}>
                      <Avatar name={f.name} src={f.avatar_url} size={42}/>
                    </div>
                    <div className="player-info">
                      <span className="player-name">{f.name}</span>
                      {[f.city,f.country].filter(Boolean).join(', ') && <span className="player-meta"><IconMapPin /> {[f.city,f.country].filter(Boolean).join(', ')}</span>}
                    </div>
                    <button className={`action-btn ${invited.has(f.id) ? 'success' : 'primary'}`} onClick={() => !invited.has(f.id) && inviteFriend(f.id)} disabled={inviting === f.id || invited.has(f.id)} style={invited.has(f.id)?{cursor:'default',opacity:0.8}:{}}>
                      {inviting === f.id ? <span className="spinner sm" /> : invited.has(f.id) ? <>⏳ Pending</> : <><IconUserPlus /> Invite</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {viewProfileId && <PlayerProfileModal playerId={viewProfileId} onClose={() => setViewProfileId(null)} />}

      {activeTab === 'matches' && (
        <MatchesTab group={currentGroup} user={user} isAdmin={isAdmin} />
      )}

      {activeTab === 'findtime' && (
        <FindTimeTab group={currentGroup} />
      )}

      {showEdit && (
        <EditGroupModal
          group={currentGroup}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadDetail(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  EDIT GROUP MODAL
// ══════════════════════════════════════════════════════════════════
function EditGroupModal({ group, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: group.name || '',
    description: group.description || '',
    match_day: group.match_day !== null && group.match_day !== undefined ? String(group.match_day) : '',
    match_start: group.match_start?.slice(0,5) || '',
    match_end: group.match_end?.slice(0,5) || '',
    max_players: group.max_players || 10,
  });
  const [stadiums, setStadiums] = useState([]);
  const [selectedStadium, setSelectedStadium] = useState(group.stadium_id ? String(group.stadium_id) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('/stadiums').then(setStadiums).catch(() => {});
  }, []);

  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await apiCall(`/groups/${group.id}`, 'PUT', {
        name: form.name,
        description: form.description || null,
        stadium_id: selectedStadium || null,
        match_day: form.match_day !== '' ? parseInt(form.match_day) : null,
        match_start: form.match_start || null,
        match_end: form.match_end || null,
        max_players: parseInt(form.max_players) || 10,
      });
      onSaved();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Edit Group</h2>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field"><label>Group Name *</label><input name="name" value={form.name} onChange={handle} placeholder="Friday Night FC" required /></div>
          <div className="field"><label>Description</label><textarea name="description" value={form.description} onChange={handle} placeholder="What's this group about?" rows={2} /></div>
          <div className="field"><label>Stadium <span className="optional">(optional)</span></label>
            <select value={selectedStadium} onChange={e => setSelectedStadium(e.target.value)}>
              <option value="">No stadium selected</option>
              {stadiums.map(s => <option key={s.id} value={s.id}>{s.name} — {[s.city, s.country].filter(Boolean).join(', ')}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="field"><label>Match Day</label>
              <select name="match_day" value={form.match_day} onChange={handle}>
                <option value="">Any day</option>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="field"><label>Max Players</label>
              <input name="max_players" type="number" min="2" max="50" value={form.max_players} onChange={handle} />
            </div>
          </div>
          {form.match_day !== '' && (
            <div className="form-row">
              <div className="field"><label>Start Time</label><input name="match_start" type="time" value={form.match_start} onChange={handle} /></div>
              <div className="field"><label>End Time</label><input name="match_end" type="time" value={form.match_end} onChange={handle} /></div>
            </div>
          )}
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



// ══════════════════════════════════════════════════════════════════
//  MATCHES TAB
// ══════════════════════════════════════════════════════════════════
function StarDisplay({ rating, max = 10 }) {
  const filled = Math.round((rating / max) * 5);
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: 13, color: i <= filled ? '#facc15' : '#374151' }}>★</span>
      ))}
    </span>
  );
}

const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Winger'];

function MatchesTab({ group, user, isAdmin }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [editMatch, setEditMatch] = useState(null);
  const [statsMatch, setStatsMatch] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setMatches(await apiCall(`/match-results/groups/${group.id}`)); } catch {}
    setLoading(false);
  }, [group.id]);

  useEffect(() => { load(); }, [load]);

  const deleteMatch = async (id) => {
    if (!window.confirm('Delete this match?')) return;
    try { await apiCall(`/match-results/${id}`, 'DELETE'); await load(); } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="center-spinner" style={{ padding: 40 }}><span className="spinner large" /></div>;

  return (
    <div className="tab-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{matches.length} match{matches.length !== 1 ? 'es' : ''} logged</span>
        {isAdmin && (
          <button className="action-btn primary" onClick={() => { setEditMatch(null); setShowLog(true); }}>
            <IconPlus /> Log Match
          </button>
        )}
      </div>

      {matches.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><IconCalendar /></div>
          <p className="empty-title">No matches yet</p>
          <p>{isAdmin ? 'Log your first match result to start tracking stats.' : 'The group admin can log match results here.'}</p>
        </div>
      )}

      <div className="booking-list">
        {matches.map(m => {
          const myStats = (m.player_stats || []).find(s => s.player_id === user.id);
          return (
            <div key={m.id} className="booking-card" style={{ flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      fontSize: 22, fontWeight: 800, color: '#4ade80',
                      background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
                      borderRadius: 10, padding: '4px 14px',
                    }}>
                      {m.score_a} – {m.score_b}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(m.played_on).toLocaleDateString()}</div>
                      {m.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>"{m.notes}"</div>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="action-btn primary" style={{ fontSize: 12 }} onClick={() => setStatsMatch(m)}>
                    {myStats ? '✏️ Edit Stats' : '+ Log My Stats'}
                  </button>
                  {isAdmin && (
                    <>
                      <button className="action-btn muted" style={{ fontSize: 12 }} onClick={() => { setEditMatch(m); setShowLog(true); }}>
                        <IconEdit />
                      </button>
                      <button className="action-btn danger" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => deleteMatch(m.id)}>
                        <IconTrash />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {(m.player_stats || []).length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Player Stats</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(m.player_stats || []).map(s => (
                      <div key={s.player_id} style={{
                        background: 'var(--surface2, rgba(255,255,255,0.04))',
                        border: '1px solid var(--border)', borderRadius: 10,
                        padding: '8px 12px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'center',
                        ...(s.player_id === user.id ? { borderColor: 'rgba(74,222,128,0.4)' } : {})
                      }}>
                        <span style={{ fontWeight: 600 }}>{s.player_name}{s.player_id === user.id ? ' (you)' : ''}</span>
                        {s.position && <span style={{ color: '#c084fc' }}>{s.position}</span>}
                        <span style={{ color: '#60a5fa' }}>⚽ {s.goals}</span>
                        <span style={{ color: '#fb923c' }}>🅰️ {s.assists}</span>
                        {s.notes_good && <span style={{ color: '#4ade80', fontSize: 11 }}>✅ {s.notes_good.slice(0, 40)}{s.notes_good.length > 40 ? '…' : ''}</span>}
                        {s.notes_bad && <span style={{ color: '#f87171', fontSize: 11 }}>❌ {s.notes_bad.slice(0, 40)}{s.notes_bad.length > 40 ? '…' : ''}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showLog && (
        <LogMatchModal
          match={editMatch}
          groupId={group.id}
          onClose={() => { setShowLog(false); setEditMatch(null); }}
          onSaved={() => { setShowLog(false); setEditMatch(null); load(); }}
        />
      )}
      {statsMatch && (
        <LogStatsModal
          match={statsMatch}
          userId={user.id}
          onClose={() => setStatsMatch(null)}
          onSaved={() => { setStatsMatch(null); load(); }}
        />
      )}
    </div>
  );
}

function LogMatchModal({ match, groupId, onClose, onSaved }) {
  const [form, setForm] = useState({
    played_on: match?.played_on?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    score_a: match?.score_a ?? 0,
    score_b: match?.score_b ?? 0,
    notes: match?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      if (match) {
        await apiCall(`/match-results/${match.id}`, 'PATCH', form);
      } else {
        await apiCall(`/match-results/groups/${groupId}`, 'POST', form);
      }
      onSaved();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{match ? 'Edit Match' : 'Log Match Result'}</h2>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field"><label>Date *</label><input name="played_on" type="date" value={form.played_on} onChange={handle} required /></div>
          <div className="form-row">
            <div className="field"><label>Team A Score</label><input name="score_a" type="number" min="0" value={form.score_a} onChange={handle} /></div>
            <div className="field"><label>Team B Score</label><input name="score_b" type="number" min="0" value={form.score_b} onChange={handle} /></div>
          </div>
          <div className="field"><label>Notes <span className="optional">(optional)</span></label><input name="notes" value={form.notes} onChange={handle} placeholder="e.g. Rainy game, intense match..." /></div>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? <span className="spinner" /> : match ? 'Save Changes' : 'Log Match'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LogStatsModal({ match, userId, onClose, onSaved }) {
  const existing = (match.player_stats || []).find(s => s.player_id === userId);
  const [form, setForm] = useState({
    goals: existing?.goals ?? 0,
    assists: existing?.assists ?? 0,
    position: existing?.position || '',
    notes_good: existing?.notes_good || '',
    notes_bad: existing?.notes_bad || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const handle = e => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await apiCall(`/match-results/${match.id}/stats`, 'POST', {
        goals: parseInt(form.goals) || 0,
        assists: parseInt(form.assists) || 0,
        position: form.position || null,
        notes_good: form.notes_good || null,
        notes_bad: form.notes_bad || null,
      });
      onSaved();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">My Stats</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {new Date(match.played_on).toLocaleDateString()} · {match.score_a} – {match.score_b}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="form-row">
            <div className="field"><label>Goals</label><input name="goals" type="number" min="0" value={form.goals} onChange={handle} /></div>
            <div className="field"><label>Assists</label><input name="assists" type="number" min="0" value={form.assists} onChange={handle} /></div>
          </div>
          <div className="field"><label>Position <span className="optional">(optional)</span></label>
            <select name="position" value={form.position} onChange={handle}>
              <option value="">Select position</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#4ade80', fontSize: 15 }}>✅</span> What went well?
              <span className="optional">(optional)</span>
            </label>
            <textarea
              name="notes_good"
              value={form.notes_good}
              onChange={handle}
              placeholder="e.g. Good movement off the ball, won most headers, two key passes..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#f87171', fontSize: 15 }}>❌</span> What went wrong?
              <span className="optional">(optional)</span>
            </label>
            <textarea
              name="notes_bad"
              value={form.notes_bad}
              onChange={handle}
              placeholder="e.g. Lost the ball too often under pressure, poor first touch, mistimed tackles..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.1)', borderRadius: 8 }}>
            💡 The more detail you add, the better the AI analyst can coach you.
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="submit-btn" style={{ flex: 1 }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Save Stats'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  FIND TIME TAB (Smart Scheduling)
// ══════════════════════════════════════════════════════════════════
function FindTimeTab({ group }) {
  const [stadiums, setStadiums] = useState([]);
  const [selectedStadium, setSelectedStadium] = useState(group.stadium_id ? String(group.stadium_id) : '');
  const [suggestions, setSuggestions] = useState(null);
  const [totalMembers, setTotalMembers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const DAYS_LOCAL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  useEffect(() => {
    apiCall('/stadiums').then(setStadiums).catch(() => {});
  }, []);

  const findTime = async () => {
    if (!selectedStadium) { setError('Please select a stadium first'); return; }
    setLoading(true); setError(''); setSuggestions(null);
    try {
      const d = await apiCall(`/match-results/groups/${group.id}/smart-schedule?stadium_id=${selectedStadium}`);
      setSuggestions(d.suggestions);
      setTotalMembers(d.totalMembers);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const pct = (n) => Math.round((n / totalMembers) * 100);
  const barColor = (n) => {
    const p = pct(n);
    if (p >= 80) return '#4ade80';
    if (p >= 50) return '#facc15';
    return '#fb923c';
  };

  return (
    <div className="tab-content">
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Smart Match Scheduler</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Finds the best time slots where the most group members are free AND the stadium has availability.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 200, margin: 0 }}>
            <label>Stadium</label>
            <select value={selectedStadium} onChange={e => setSelectedStadium(e.target.value)}>
              <option value="">Select a stadium…</option>
              {stadiums.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {[s.city, s.country].filter(Boolean).join(', ')}</option>
              ))}
            </select>
          </div>
          <button className="submit-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={findTime} disabled={loading || !selectedStadium}>
            {loading ? <span className="spinner" /> : '🔍 Find Best Times'}
          </button>
        </div>
        {error && <div className="error-msg" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {suggestions !== null && (
        <>
          {suggestions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><IconClock /></div>
              <p className="empty-title">No overlapping slots found</p>
              <p>Make sure group members have set their availability in Settings, and the stadium has schedule slots configured.</p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Showing top {suggestions.length} suggestions · {totalMembers} total members
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '14px 18px',
                    borderLeft: `3px solid ${barColor(s.available_count)}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {DAYS_LOCAL[s.day]} · {s.start} – {s.end}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {s.available_members.map(m => m.name).join(', ')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: barColor(s.available_count) }}>
                          {s.available_count}/{totalMembers}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>members free</div>
                      </div>
                    </div>
                    {/* Availability bar */}
                    <div style={{ marginTop: 10, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${pct(s.available_count)}%`,
                        background: barColor(s.available_count),
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{pct(s.available_count)}% availability</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export { GroupsPage, CreateGroupModal, GroupDetail, EditGroupModal };
