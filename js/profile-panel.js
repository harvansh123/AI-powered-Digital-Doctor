/* ============================================================
   PROFILE-PANEL.JS — Slide-in Profile Panel for all pages
   Shows: user info, appointments, cancel button
   ============================================================ */

(function () {
  'use strict';

  let profilePanel = null;
  let profileUser  = null;
  let userAppointments = [];

  // ─── Inject Panel HTML + CSS ──────────────────────────────
  function injectPanel() {
    if (document.getElementById('profileSidePanel')) return;

    const style = document.createElement('style');
    style.textContent = `
      /* ── Profile Panel Overlay ── */
      #profileOverlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.45);
        z-index: 8000;
        opacity: 0; pointer-events: none;
        transition: opacity .3s ease;
      }
      #profileOverlay.open { opacity: 1; pointer-events: all; }

      /* ── Profile Slide Panel ── */
      #profileSidePanel {
        position: fixed;
        top: 0; right: 0;
        width: min(420px, 100vw);
        height: 100vh;
        background: #fff;
        box-shadow: -8px 0 40px rgba(0,0,0,.18);
        z-index: 8001;
        transform: translateX(100%);
        transition: transform .35s cubic-bezier(.4,0,.2,1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #profileSidePanel.open { transform: translateX(0); }

      /* ── Panel Header ── */
      .pp-header {
        background: linear-gradient(135deg, #1d4ed8, #3b82f6, #0ea5e9);
        padding: 1.75rem 1.5rem 1.25rem;
        color: white;
        position: relative;
        flex-shrink: 0;
      }
      .pp-close {
        position: absolute; top: 1rem; right: 1rem;
        background: rgba(255,255,255,.2);
        border: none; border-radius: 50%;
        width: 34px; height: 34px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; font-size: 1rem; color: white;
        transition: background .2s;
      }
      .pp-close:hover { background: rgba(255,255,255,.35); }
      .pp-avatar {
        width: 68px; height: 68px; border-radius: 50%;
        background: rgba(255,255,255,.2);
        border: 3px solid rgba(255,255,255,.5);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.6rem; font-weight: 800; color: white;
        margin-bottom: .75rem;
      }
      .pp-name { font-size: 1.2rem; font-weight: 700; margin-bottom: 2px; }
      .pp-role-badge {
        display: inline-block;
        background: rgba(255,255,255,.25);
        border-radius: 20px;
        padding: 2px 12px;
        font-size: .72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .05em;
      }

      /* ── Tabs ── */
      .pp-tabs {
        display: flex;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0;
        background: #f8fafc;
      }
      .pp-tab {
        flex: 1;
        padding: .75rem;
        border: none;
        background: none;
        font-size: .82rem;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        transition: color .2s, border-bottom .2s;
        border-bottom: 3px solid transparent;
        font-family: inherit;
      }
      .pp-tab.active {
        color: #1d4ed8;
        border-bottom-color: #1d4ed8;
        background: #fff;
      }

      /* ── Body ── */
      .pp-body {
        flex: 1;
        overflow-y: auto;
        padding: 1.25rem 1.5rem;
      }
      .pp-section-title {
        font-size: .7rem;
        text-transform: uppercase;
        letter-spacing: .08em;
        font-weight: 700;
        color: #94a3b8;
        margin: 1rem 0 .5rem;
      }
      .pp-info-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: .65rem 0;
        border-bottom: 1px solid #f1f5f9;
      }
      .pp-info-icon {
        width: 34px; height: 34px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1rem;
        flex-shrink: 0;
      }
      .pp-info-label { font-size: .72rem; color: #94a3b8; }
      .pp-info-value { font-size: .88rem; font-weight: 600; color: #1e293b; }

      /* ── Appointment Cards ── */
      .pp-appt-card {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: .85rem 1rem;
        margin-bottom: .65rem;
        transition: box-shadow .2s;
        position: relative;
      }
      .pp-appt-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); }
      .pp-appt-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: .5rem;
      }
      .pp-appt-doctor { font-weight: 700; font-size: .88rem; }
      .pp-appt-meta { font-size: .75rem; color: #64748b; margin-top: 2px; }
      .pp-cancel-btn {
        background: none;
        border: 1px solid #fca5a5;
        color: #dc2626;
        border-radius: 20px;
        padding: 4px 12px;
        font-size: .72rem;
        font-weight: 600;
        cursor: pointer;
        transition: background .2s, color .2s;
        font-family: inherit;
      }
      .pp-cancel-btn:hover { background: #dc2626; color: white; }
      .pp-cancel-btn:disabled { opacity: .5; cursor: not-allowed; }

      .pp-status-pill {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 20px;
        font-size: .7rem;
        font-weight: 600;
      }
      .pp-status-pending   { background: rgba(245,158,11,.1);  color: #b45309; }
      .pp-status-confirmed { background: rgba(59,130,246,.1);  color: #1d4ed8; }
      .pp-status-completed { background: rgba(16,185,129,.1);  color: #059669; }
      .pp-status-cancelled { background: rgba(100,116,139,.1); color: #475569; }
      .pp-status-rejected  { background: rgba(220,38,38,.1);   color: #dc2626; }

      .pp-empty {
        text-align: center;
        padding: 2.5rem 1rem;
        color: #94a3b8;
      }
      .pp-empty-icon { font-size: 2.5rem; margin-bottom: .5rem; }
      .pp-empty p { font-size: .85rem; }

      .pp-logout-btn {
        width: 100%;
        padding: .75rem;
        border: none;
        border-radius: 10px;
        background: linear-gradient(135deg, #dc2626, #ef4444);
        color: white;
        font-family: inherit;
        font-size: .88rem;
        font-weight: 600;
        cursor: pointer;
        margin-top: 1rem;
        transition: opacity .2s;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .pp-logout-btn:hover { opacity: .9; }

      .pp-spinner {
        width: 28px; height: 28px; border: 3px solid #e2e8f0;
        border-top-color: #1d4ed8; border-radius: 50%;
        animation: ppSpin .7s linear infinite; margin: 2rem auto;
      }
      @keyframes ppSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'profileOverlay';
    overlay.addEventListener('click', closeProfilePanel);
    document.body.appendChild(overlay);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'profileSidePanel';
    panel.innerHTML = `
      <div class="pp-header" id="ppHeader">
        <button class="pp-close" onclick="closeProfilePanel()" title="Close">✕</button>
        <div class="pp-avatar" id="ppAvatar">…</div>
        <div class="pp-name" id="ppName">Loading…</div>
        <span class="pp-role-badge" id="ppRoleBadge">—</span>
      </div>
      <div class="pp-tabs">
        <button class="pp-tab active" id="ppTab-info"  onclick="switchProfileTab('info')">👤 Profile</button>
        <button class="pp-tab"        id="ppTab-appts" onclick="switchProfileTab('appts')">📅 Appointments</button>
      </div>
      <div class="pp-body" id="ppBody">
        <div class="pp-spinner"></div>
      </div>
    `;
    document.body.appendChild(panel);
    profilePanel = panel;
  }

  // ─── Open / Close ─────────────────────────────────────────
  window.openProfilePanel = async function () {
    injectPanel();
    document.getElementById('profileOverlay').classList.add('open');
    profilePanel.classList.add('open');
    document.body.style.overflow = 'hidden';
    await loadProfileData();
  };

  window.closeProfilePanel = function () {
    document.getElementById('profileOverlay')?.classList.remove('open');
    profilePanel?.classList.remove('open');
    document.body.style.overflow = '';
  };

  // ─── Tab Switching ────────────────────────────────────────
  let currentTab = 'info';
  window.switchProfileTab = function (tab) {
    currentTab = tab;
    document.querySelectorAll('.pp-tab').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById('ppTab-' + tab);
    if (activeBtn) activeBtn.classList.add('active');
    renderTabContent();
  };

  // ─── Load Profile Data ────────────────────────────────────
  async function loadProfileData() {
    const body = document.getElementById('ppBody');
    if (body) body.innerHTML = '<div class="pp-spinner"></div>';

    try {
      if (!window.supabaseClient) throw new Error('Supabase not connected');

      // Get current session
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) {
        body.innerHTML = `<div class="pp-empty"><div class="pp-empty-icon">🔐</div><p>Please <a href="login.html" style="color:#1d4ed8;font-weight:600">sign in</a> to view your profile.</p></div>`;
        return;
      }

      // Fetch profile
      const { data: profile, error: profErr } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profErr) throw profErr;

      profileUser = { ...profile, email: session.user.email };

      // Update header
      const initials = ((profile.first_name?.[0]||'')+(profile.last_name?.[0]||'')).toUpperCase()||'👤';
      const fullName = `${profile.first_name||''} ${profile.last_name||''}`.trim() || 'User';
      const roleIcons  = { patient: '🩺 Patient', doctor: '👨‍⚕️ Doctor', admin: '🛡️ Admin' };

      document.getElementById('ppAvatar').textContent = initials;
      document.getElementById('ppName').textContent   = fullName;
      document.getElementById('ppRoleBadge').textContent = roleIcons[profile.role] || profile.role;

      // Fetch appointments in parallel
      await fetchUserAppointments(session.user.id, profile.role);

      renderTabContent();

    } catch (err) {
      if (body) body.innerHTML = `<div class="pp-empty"><div class="pp-empty-icon">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  async function fetchUserAppointments(userId, role) {
    try {
      let query;
      if (role === 'patient') {
        query = window.supabaseClient
          .from('appointments')
          .select('*')
          .eq('patient_id', userId)
          .order('date', { ascending: false });
      } else if (role === 'doctor') {
        // For doctors, get their doctor record first then appointments
        const { data: docRecord } = await window.supabaseClient
          .from('doctors')
          .select('id')
          .eq('user_id', userId)
          .single();
        if (docRecord) {
          query = window.supabaseClient
            .from('appointments')
            .select('*')
            .eq('doctor_id', docRecord.id)
            .order('date', { ascending: false });
        }
      }

      if (query) {
        const { data, error } = await query;
        if (!error) userAppointments = data || [];
      } else {
        userAppointments = [];
      }
    } catch (_) {
      userAppointments = [];
    }
  }

  // ─── Render Tab Content ───────────────────────────────────
  function renderTabContent() {
    const body = document.getElementById('ppBody');
    if (!body) return;
    if (currentTab === 'info') {
      renderInfoTab(body);
    } else {
      renderApptsTab(body);
    }
  }

  function renderInfoTab(body) {
    if (!profileUser) { body.innerHTML = '<div class="pp-spinner"></div>'; return; }
    const u = profileUser;
    const roleColors = { patient: '#1d4ed8', doctor: '#059669', admin: '#7c3aed' };
    const roleColor  = roleColors[u.role] || '#1d4ed8';
    const joinedDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : '—';

    const infoRows = [
      { icon:'👤', bg:'#eff6ff', label:'Full Name',    val: `${u.first_name||'—'} ${u.last_name||''}`.trim() },
      { icon:'📧', bg:'#f0fdf4', label:'Email',        val: u.email || '—' },
      { icon:'📞', bg:'#fdf4ff', label:'Phone',        val: u.phone || '—' },
      { icon:'🎭', bg:'#fff7ed', label:'Role',         val: u.role ? u.role.charAt(0).toUpperCase()+u.role.slice(1) : '—' },
      { icon:'📅', bg:'#fef9c3', label:'Member Since', val: joinedDate },
      { icon:'🔴', bg:'#fff1f2', label:'Status',       val: u.status ? u.status.charAt(0).toUpperCase()+u.status.slice(1) : '—' },
    ];

    body.innerHTML = `
      <div class="pp-section-title">Account Information</div>
      ${infoRows.map(r => `
        <div class="pp-info-row">
          <div class="pp-info-icon" style="background:${r.bg}">${r.icon}</div>
          <div style="flex:1;min-width:0">
            <div class="pp-info-label">${r.label}</div>
            <div class="pp-info-value" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.val}</div>
          </div>
        </div>
      `).join('')}

      <div class="pp-section-title">Quick Actions</div>
      ${u.role === 'patient' ? `<a href="appointment.html" style="display:block;text-align:center;padding:.7rem;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-weight:600;font-size:.85rem;text-decoration:none;margin-bottom:.5rem;border:1px solid #bfdbfe">📅 Book Appointment</a>` : ''}
      ${u.role === 'doctor'  ? `<a href="doctor-dashboard.html" style="display:block;text-align:center;padding:.7rem;border-radius:10px;background:#f0fdf4;color:#059669;font-weight:600;font-size:.85rem;text-decoration:none;margin-bottom:.5rem;border:1px solid #bbf7d0">🏥 Doctor Dashboard</a>` : ''}
      ${u.role === 'admin'   ? `<a href="admin-dashboard.html" style="display:block;text-align:center;padding:.7rem;border-radius:10px;background:#faf5ff;color:#7c3aed;font-weight:600;font-size:.85rem;text-decoration:none;margin-bottom:.5rem;border:1px solid #e9d5ff">🛡️ Admin Dashboard</a>` : ''}

      <button class="pp-logout-btn" onclick="profilePanelLogout()">
        🚪 Sign Out
      </button>
    `;
  }

  function renderApptsTab(body) {
    if (!profileUser) { body.innerHTML = '<div class="pp-spinner"></div>'; return; }

    if (userAppointments.length === 0) {
      body.innerHTML = `
        <div class="pp-empty">
          <div class="pp-empty-icon">📅</div>
          <p>No appointments found.</p>
          ${profileUser.role === 'patient'
            ? `<a href="appointment.html" style="display:inline-block;margin-top:.5rem;padding:.5rem 1.25rem;background:#1d4ed8;color:white;border-radius:20px;font-size:.8rem;font-weight:600;text-decoration:none">+ Book Now</a>`
            : ''}
        </div>`;
      return;
    }

    const roleLabel = profileUser.role === 'doctor' ? 'Patient' : 'Doctor';

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <div class="pp-section-title" style="margin:0">Your Appointments (${userAppointments.length})</div>
        ${profileUser.role === 'patient'
          ? `<a href="appointment.html" style="font-size:.75rem;color:#1d4ed8;font-weight:600;text-decoration:none">+ Book New</a>`
          : ''}
      </div>
      ${userAppointments.map(a => {
        const canCancel = profileUser.role === 'patient' && ['pending','confirmed'].includes(a.status);
        const personName = profileUser.role === 'patient' ? (a.doctor_name || 'Doctor') : a.patient_name;
        return `
          <div class="pp-appt-card" id="ppc-${a.id}">
            <div class="pp-appt-header">
              <div>
                <div class="pp-appt-doctor">
                  ${profileUser.role === 'patient' ? '👨‍⚕️ ' : '👤 '}${personName}
                </div>
              </div>
              <span class="pp-status-pill pp-status-${a.status}">● ${a.status}</span>
            </div>
            <div class="pp-appt-meta">
              📅 ${formatApptDate(a.date)} · ⏰ ${a.time_slot||'—'}
              ${a.reason ? `<br>📝 ${a.reason}` : ''}
              <br><span style="font-size:.68rem;color:#94a3b8">Ref: ${a.reference_id}</span>
            </div>
            ${canCancel ? `
              <div style="margin-top:.6rem;text-align:right">
                <button class="pp-cancel-btn" id="cancel-${a.id}" onclick="cancelAppointmentFromProfile('${a.id}')">Cancel Appointment</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    `;
  }

  // ─── Cancel Appointment from Profile ─────────────────────
  window.cancelAppointmentFromProfile = async function (apptId) {
    const btn = document.getElementById('cancel-' + apptId);
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }

    try {
      const { error } = await window.supabaseClient
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apptId)
        .eq('patient_id', profileUser.id);

      if (error) throw error;

      // Update local state
      const idx = userAppointments.findIndex(a => a.id === apptId);
      if (idx !== -1) userAppointments[idx].status = 'cancelled';

      // Show success toast
      if (typeof showToast === 'function') showToast('Appointment cancelled ✅', 'success');

      // Re-render tab
      renderTabContent();

    } catch (err) {
      if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Cancel Appointment'; }
    }
  };

  // ─── Logout from panel ────────────────────────────────────
  window.profilePanelLogout = async function () {
    closeProfilePanel();
    if (typeof supabaseLogout === 'function') {
      await supabaseLogout();
    } else if (window.supabaseClient) {
      await window.supabaseClient.auth.signOut();
      localStorage.removeItem('aidoc_user');
      localStorage.removeItem('aidoc_token');
      window.location.href = 'login.html';
    }
  };

  // ─── Date helper ──────────────────────────────────────────
  function formatApptDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  }

  // ─── Auto-wire nav "My Profile" links ────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Intercept any anchors with href="#" that say "My Profile" or have data-profile
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-action="profile"], a[href="#profile"]');
      if (link) {
        e.preventDefault();
        openProfilePanel();
      }
    });
  });

})();
