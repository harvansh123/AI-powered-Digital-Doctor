/* ============================================================
   ADMIN-DASHBOARD.JS — Supabase-powered Admin Portal
   Panels: Overview · Doctor Approvals · Users · Appointments
           Admins · AI Monitoring · Content Management
   ============================================================ */

const SUPABASE_FUNCTIONS_URL = 'https://xlpaiyjwaxhbnospxwjt.supabase.co/functions/v1';

let currentAdminUser = null;
let allUsers         = [];
let allAdmins        = [];
let allDoctors       = [];       // ALL doctors (pending + approved + rejected)
let allAppointments  = [];
let pendingDoctors   = [];
let aiLogs           = [];

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  currentAdminUser = await requireAuth('admin');
  if (!currentAdminUser) return;

  initSidebar();
  loadAdminInfo();
  switchAdminPanel('overview');

  // Load all data in parallel — each function handles its own errors
  await Promise.allSettled([
    loadAdminStats(),
    loadAllDoctors(),          // loads ALL doctors + splits into pendingDoctors
    loadAllUsers(),
    loadAllAppointments(),
    loadActivityLog(),
    loadAllAdmins(),
  ]);
});

// ─── Sidebar ──────────────────────────────────────────────────
function initSidebar() {
  const toggle  = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('adminSidebar');
  toggle?.addEventListener('click',  () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
  overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
}

function loadAdminInfo() {
  const u = currentAdminUser;
  const initials = ((u.first_name?.[0]||'')+(u.last_name?.[0]||'')).toUpperCase()||'AD';
  const name = `${u.first_name||'Admin'} ${u.last_name||''}`.trim();
  document.querySelectorAll('.admin-user-initials').forEach(el => el.textContent = initials);
  document.querySelectorAll('.admin-user-name').forEach(el => el.textContent = name);
}

// ─── Panel Switching ──────────────────────────────────────────
function switchAdminPanel(panel) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('apanel-' + panel)?.classList.add('active');
  document.getElementById('anav-' + panel)?.classList.add('active');
  const titles = {
    overview:     'Admin Dashboard Overview',
    approvals:    'Doctor Approvals',
    users:        'User Management',
    appointments: 'All Appointments',
    admins:       'Admin Management',
    hospitals:    'Hospital Registration',
    medicines:    'Medicine Database',
    ai:           'AI System Monitoring',
    content:      'Content Management',
    system:       'System Monitor',
  };
  document.querySelector('.dashboard-topbar-title').textContent = titles[panel] || 'Admin';
  document.getElementById('adminSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');

  if (panel === 'overview')  setTimeout(loadOverviewPanels, 200);
  if (panel === 'system')    { setTimeout(checkSystemHealth, 300); checkSocketStatus(); }
  if (panel === 'ai')        loadAILogs();
  if (panel === 'content')   loadContentPanel();
  if (panel === 'admins')    loadAllAdmins();
  if (panel === 'hospitals') loadHospitals();
  if (panel === 'medicines') { loadMedicines(); loadUnknownMedicines(); }
}

// ─── Stats ────────────────────────────────────────────────────
async function loadAdminStats() {
  try {
    const [
      { count: patientCount },
      { count: doctorCount  },
      { count: apptCount    },
      { data: pDocs }
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count:'exact', head:true }).eq('role','patient'),
      supabase.from('doctors').select('*', { count:'exact', head:true }).eq('is_approved', true),
      supabase.from('appointments').select('*', { count:'exact', head:true }),
      supabase.from('doctors').select('id').eq('approval_status', 'pending'),
    ]);

    const pendingCount = pDocs?.length || 0;

    setEl('adminStatPatients', patientCount || 0);
    setEl('adminStatDoctors',  doctorCount  || 0);
    setEl('adminStatAppts',    apptCount    || 0);
    setEl('adminStatPending',  pendingCount || 0);

    const badge = document.getElementById('approvalBadge');
    if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount > 0 ? 'inline' : 'none'; }
    const countBadge = document.getElementById('approvalCountBadge');
    if (countBadge) countBadge.textContent = pendingCount + ' pending';
  } catch (err) {
    console.error('[Admin] loadAdminStats error:', err);
  }
}

// Load ALL doctors via secure RPC function (includes email from auth.users)
async function loadAllDoctors() {
  const container = document.getElementById('allDoctorsList');
  if (container) {
    container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  }

  try {
    // Use the secure RPC function that admin-only can call
    const { data: doctors, error } = await supabase.rpc('get_all_doctors_for_admin');

    if (error) throw error;

    // Map RPC results to our local structure
    allDoctors = (doctors || []).map(d => ({
      id:              d.doctor_id,
      user_id:         d.user_id || d.profile_id,
      specialization:  d.specialization,
      experience:      d.experience,
      hospital:        d.hospital,
      bio:             d.bio,
      consultation_fee: d.consultation_fee,
      is_approved:     d.is_approved,
      is_available:    d.is_available,
      approval_status: d.approval_status || 'pending',
      created_at:      d.doctor_created || d.profile_created,
      email:           d.email || '',
      profiles: {
        id:         d.profile_id,
        first_name: d.first_name,
        last_name:  d.last_name,
        phone:      d.phone,
        status:     d.profile_status,
        created_at: d.profile_created,
      }
    }));

    // Split into pending
    pendingDoctors = allDoctors.filter(d => d.approval_status === 'pending');

    renderAllDoctors();

    // Update the badge
    const badge = document.getElementById('approvalBadge');
    if (badge) {
      badge.textContent = pendingDoctors.length;
      badge.style.display = pendingDoctors.length > 0 ? 'inline' : 'none';
    }
    const countBadge = document.getElementById('approvalCountBadge');
    if (countBadge) countBadge.textContent = pendingDoctors.length + ' pending';

  } catch (err) {
    console.error('[Admin] loadAllDoctors error:', err);
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size:2rem">⚠️</div>
          <h3>Failed to load doctors</h3>
          <p style="color:var(--text-light)">${err.message}</p>
          <button class="btn btn-primary" style="margin-top:1rem" onclick="loadAllDoctors()">🔄 Retry</button>
        </div>`;
    }
  }
}

// Active filter for doctors panel
let doctorFilter = 'all'; // 'all' | 'pending' | 'approved' | 'rejected'

function filterDoctors(filter) {
  doctorFilter = filter;
  // Update button styles
  ['all','pending','approved','rejected'].forEach(f => {
    const btn = document.getElementById('docFilter-' + f);
    if (btn) {
      btn.style.fontWeight  = f === filter ? '700' : '500';
      btn.style.background  = f === filter ? 'var(--primary)' : 'var(--bg)';
      btn.style.color       = f === filter ? 'white' : 'var(--text-medium)';
      btn.style.borderColor = f === filter ? 'var(--primary)' : 'var(--border)';
    }
  });
  renderAllDoctors();
}

function renderAllDoctors() {
  const container = document.getElementById('allDoctorsList');
  if (!container) return;

  let list = allDoctors;
  if (doctorFilter !== 'all') {
    list = allDoctors.filter(d => d.approval_status === doctorFilter);
  }

  if (list.length === 0) {
    const msgs = {
      all:      { icon:'👨‍⚕️', title:'No doctors registered yet', sub:'Doctors will appear here after they register.' },
      pending:  { icon:'✅', title:'All caught up!', sub:'No pending doctor approvals.' },
      approved: { icon:'👨‍⚕️', title:'No approved doctors', sub:'Approve doctors to see them here.' },
      rejected: { icon:'🚫', title:'No rejected doctors', sub:'No rejected applications.' },
    };
    const m = msgs[doctorFilter] || msgs.all;
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${m.icon}</div>
        <h3>${m.title}</h3>
        <p>${m.sub}</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(doc => {
    const profile = doc.profiles || {};
    const firstName  = profile.first_name || '—';
    const lastName   = profile.last_name  || '';
    const initials   = ((firstName[0]||'') + (lastName[0]||'')).toUpperCase();
    const email      = doc.email || '';
    const phone      = profile.phone || '—';

    const statusColors = {
      pending:  { bg:'rgba(245,158,11,0.1)',  color:'#b45309',  label:'⏳ Pending'  },
      approved: { bg:'rgba(16,185,129,0.1)',  color:'#059669',  label:'✅ Approved' },
      rejected: { bg:'rgba(220,38,38,0.1)',   color:'#dc2626',  label:'🚫 Rejected' },
    };
    const sc = statusColors[doc.approval_status] || statusColors.pending;

    const avatarGrad = doc.approval_status === 'approved'
      ? 'linear-gradient(135deg,#059669,#34d399)'
      : doc.approval_status === 'rejected'
        ? 'linear-gradient(135deg,#dc2626,#f87171)'
        : 'linear-gradient(135deg,#f59e0b,#fbbf24)';

    const actionBtns = doc.approval_status === 'pending'
      ? `<button class="btn btn-sm" style="background:linear-gradient(135deg,#059669,#10b981);color:white;white-space:nowrap" onclick="updateDoctorApproval('${doc.id}', '${doc.user_id}', 'approved')">✓ Approve</button>
         <button class="btn btn-sm" style="background:linear-gradient(135deg,#dc2626,#ef4444);color:white;white-space:nowrap" onclick="updateDoctorApproval('${doc.id}', '${doc.user_id}', 'rejected')">✗ Reject</button>`
      : doc.approval_status === 'approved'
        ? `<button class="btn btn-sm" style="background:linear-gradient(135deg,#dc2626,#ef4444);color:white;white-space:nowrap" onclick="updateDoctorApproval('${doc.id}', '${doc.user_id}', 'rejected')">🚫 Revoke</button>`
        : `<button class="btn btn-sm" style="background:linear-gradient(135deg,#059669,#10b981);color:white;white-space:nowrap" onclick="updateDoctorApproval('${doc.id}', '${doc.user_id}', 'approved')">✓ Approve</button>`;

    return `
      <div id="doctor-card-${doc.id}" style="border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;background:white;margin-bottom:1rem;transition:var(--transition)" onmouseover="this.style.boxShadow='var(--card-shadow-hover)'" onmouseout="this.style.boxShadow=''">
        <div style="width:52px;height:52px;border-radius:50%;background:${avatarGrad};display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.1rem;flex-shrink:0">
          ${initials}
        </div>
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-weight:700;font-size:0.95rem">Dr. ${firstName} ${lastName}</div>
            <span style="font-size:0.72rem;padding:2px 10px;border-radius:20px;background:${sc.bg};color:${sc.color};font-weight:600">${sc.label}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-light);margin-top:2px">${email ? email + ' · ' : ''}${phone}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
            <span class="badge badge-primary">${doc.specialization||'—'}</span>
            <span class="badge badge-success">🏥 ${doc.hospital||'—'}</span>
            <span class="badge" style="background:rgba(245,158,11,0.1);color:#b45309">📅 ${doc.experience ? doc.experience + ' yrs' : '—'}</span>
            <span class="badge" style="background:rgba(124,58,237,0.1);color:#7c3aed">💰 ₹${doc.consultation_fee||'—'}</span>
          </div>
          ${doc.bio ? `<div style="font-size:0.78rem;color:var(--text-light);margin-top:6px;font-style:italic">"${doc.bio}"</div>` : ''}
        </div>
        <div style="font-size:0.75rem;color:var(--text-light);flex-shrink:0">Applied: ${formatDate(doc.created_at)}</div>
        <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
          ${actionBtns}
        </div>
      </div>
    `;
  }).join('');
}

async function updateDoctorApproval(doctorId, profileId, newApprovalStatus) {
  const action    = newApprovalStatus === 'approved' ? 'approved' : 'rejected';
  const isApproved = newApprovalStatus === 'approved';
  const newProfileStatus = isApproved ? 'active' : 'pending';

  // Optimistic UI update
  const card = document.getElementById('doctor-card-' + doctorId);
  if (card) card.style.opacity = '0.5';

  try {
    // 1. Update doctors table: approval_status + is_approved + is_available
    const { error: docErr } = await supabase
      .from('doctors')
      .update({
        approval_status: newApprovalStatus,
        is_approved:     isApproved,
        is_available:    isApproved,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', doctorId);

    if (docErr) throw docErr;

    // 2. Update profile status
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ status: newProfileStatus })
      .eq('id', profileId);

    if (profErr) throw profErr;

    // 3. Send notification to doctor
    const notifMsg = isApproved
      ? 'Congratulations! Your doctor registration has been approved. You can now log in and start seeing patients.'
      : 'Your doctor registration has been reviewed. Unfortunately, your application was not approved at this time.';
    await sendNotification(
      profileId,
      `Application ${action}`,
      notifMsg,
      isApproved ? 'success' : 'error'
    );

    showToast(`Doctor ${action} successfully ✅`, 'success');

    // 4. Refresh data
    await Promise.allSettled([loadAllDoctors(), loadAdminStats()]);

  } catch (err) {
    console.error('[Admin] updateDoctorApproval error:', err);
    showToast('Error: ' + err.message, 'error');
    if (card) card.style.opacity = '1';
  }
}

// ─── Legacy alias for any old references ─────────────────────
async function approveDoctor(profileId, newStatus) {
  // Find doctor by user_id = profileId
  const doc = allDoctors.find(d => d.user_id === profileId);
  if (doc) {
    await updateDoctorApproval(doc.id, profileId, newStatus === 'active' ? 'approved' : 'rejected');
  }
}

// ─── User Management ──────────────────────────────────────────
async function loadAllUsers(search = '') {
  const tbody = document.getElementById('usersTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light)"><div class="spinner" style="margin:0 auto"></div></td></tr>';

  try {
    let query = supabase.from('profiles').select('*').eq('role','patient').order('created_at', { ascending: false });
    if (search) {
      query = supabase.from('profiles').select('*').eq('role','patient')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`)
        .order('created_at', { ascending: false });
    }
    const { data, error } = await query;
    if (error) throw error;
    allUsers = data || [];
    renderUsersTable(allUsers);
  } catch (err) {
    console.error('[Admin] loadAllUsers error:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function renderUsersTable(list) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light)">No patients found</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:white;font-size:0.8rem;font-weight:700">
            ${((u.first_name||'')[0]+(u.last_name||'')[0]).toUpperCase()||'?'}
          </div>
          <div>
            <div class="patient-name">${u.first_name||''} ${u.last_name||''}</div>
            <div style="font-size:0.72rem;color:var(--text-light)">${u.phone||'—'}</div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-primary">Patient</span></td>
      <td><span class="status-pill ${u.status==='active'?'status-approved':u.status==='pending'?'status-pending':'status-blocked'}">● ${u.status}</span></td>
      <td style="font-size:0.8rem">${formatDate(u.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="action-btn ${u.status==='blocked'?'action-btn-success':'action-btn-danger'}" onclick="toggleUserBlock('${u.id}','${u.status}')">
            ${u.status==='blocked'?'✓ Unblock':'🚫 Block'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function searchUsers() {
  const q = document.getElementById('userSearch')?.value || '';
  loadAllUsers(q);
}

async function toggleUserBlock(userId, currentStatus) {
  const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
  const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`User ${newStatus === 'blocked' ? 'blocked 🚫' : 'unblocked ✅'}`, 'success');
  await loadAllUsers();
}

// ─── All Appointments ─────────────────────────────────────────
async function loadAllAppointments(search = '') {
  const tbody = document.getElementById('adminAptsTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)"><div class="spinner" style="margin:0 auto"></div></td></tr>';

  try {
    let query = supabase.from('appointments').select('*').order('created_at', { ascending: false });
    if (search) query = query.ilike('patient_name', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    allAppointments = data || [];
    renderAdminAptTable(allAppointments);
  } catch (err) {
    console.error('[Admin] loadAllAppointments error:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function renderAdminAptTable(list) {
  const tbody = document.getElementById('adminAptsTableBody');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-light)">No appointments found</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(a => `
    <tr>
      <td><span class="badge badge-primary" style="font-size:0.72rem">${a.reference_id}</span></td>
      <td class="patient-name">${a.patient_name}</td>
      <td style="font-size:0.85rem">${a.doctor_name||'—'}</td>
      <td style="font-size:0.85rem">${formatDate(a.date)} · ${a.time_slot}</td>
      <td><span class="status-pill status-${a.status}">● ${a.status}</span></td>
      <td>${['pending','confirmed'].includes(a.status)
        ? `<button class="action-btn action-btn-danger" onclick="adminCancelAppointment('${a.id}')">Cancel</button>`
        : `<span style="font-size:0.75rem;color:var(--text-light)">—</span>`}
      </td>
    </tr>
  `).join('');
}

function searchAdminApts() {
  const q = document.getElementById('adminAptSearch')?.value || '';
  loadAllAppointments(q);
}

async function adminCancelAppointment(id) {
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Appointment cancelled ✅', 'success');
  await loadAllAppointments();
}

// ─── Admin Management ─────────────────────────────────────────
async function loadAllAdmins() {
  const tbody = document.getElementById('adminsTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light)"><div class="spinner" style="margin:0 auto"></div></td></tr>';

  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('role','admin').order('created_at', { ascending: false });
    if (error) throw error;
    allAdmins = data || [];
    renderAdminsTable();
  } catch (err) {
    console.error('[Admin] loadAllAdmins error:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--danger)">Error: ${err.message}</td></tr>`;
  }
}

function renderAdminsTable() {
  const tbody = document.getElementById('adminsTableBody');
  if (!tbody) return;
  tbody.innerHTML = allAdmins.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;color:white;font-size:0.8rem;font-weight:700">
            ${((u.first_name||'')[0]+(u.last_name||'')[0]).toUpperCase()||'AD'}
          </div>
          <div>
            <div style="font-weight:600">${u.first_name||''} ${u.last_name||''}</div>
            <div style="font-size:0.72rem;color:var(--text-light)">${u.phone||'—'}</div>
          </div>
        </div>
      </td>
      <td><span class="badge" style="background:rgba(124,58,237,0.1);color:#7c3aed">🛡️ Admin</span></td>
      <td><span class="status-pill ${u.status==='active'?'status-approved':'status-blocked'}">● ${u.status}</span></td>
      <td style="font-size:0.8rem">${formatDate(u.created_at)}</td>
      <td>
        ${u.id !== currentAdminUser?.id
          ? `<button class="action-btn ${u.status==='blocked'?'action-btn-success':'action-btn-danger'}" onclick="toggleAdminBlock('${u.id}','${u.status}')">
              ${u.status==='blocked'?'✓ Enable':'🚫 Disable'}
             </button>`
          : `<span style="font-size:0.75rem;color:var(--text-light);font-style:italic">Current user</span>`}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-light)">No admins found</td></tr>`;
}

async function toggleAdminBlock(adminId, currentStatus) {
  const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
  const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', adminId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`Admin account ${newStatus === 'blocked' ? 'disabled 🚫' : 'enabled ✅'}`, 'success');
  await loadAllAdmins();
}

// ─── Hospital Management ──────────────────────────────────────────
let allHospitalsAdmin = [];

async function loadHospitals() {
  const container = document.getElementById('hospitalsList');
  const badge = document.getElementById('hospitalCountBadge');
  if (container) container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    allHospitalsAdmin = data || [];
    if (badge) badge.textContent = allHospitalsAdmin.length + ' hospital' + (allHospitalsAdmin.length !== 1 ? 's' : '');

    if (!container) return;
    if (allHospitalsAdmin.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏥</div>
          <h3>No hospitals registered yet</h3>
          <p>Use the form above to add your first hospital.</p>
        </div>`;
      return;
    }
    container.innerHTML = allHospitalsAdmin.map(h => {
      const gpsTag = (h.latitude && h.longitude)
        ? `<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">📡 GPS ✓</span>`
        : `<span class="badge" style="background:#fef9c3;color:#a16207;border:1px solid #fde047">⚠️ No GPS</span>`;
      const addr = [h.address, h.city, h.state].filter(Boolean).join(', ');
      return `<div id="hosp-${h.id}" style="border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-start;background:white;margin-bottom:0.75rem;transition:var(--transition)" onmouseover="this.style.boxShadow='var(--card-shadow)'" onmouseout="this.style.boxShadow=''">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#1d4ed8,#60a5fa);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">🏥</div>
        <div style="flex:1;min-width:180px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:0.95rem">${h.name}</span>
            ${h.emergency ? '<span class="badge badge-danger">🚨 Emergency</span>' : ''}
          </div>
          <div style="font-size:0.8rem;color:var(--text-light);margin-bottom:8px">📍 ${addr}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${h.phone    ? `<span class="badge badge-primary">📞 ${h.phone}</span>` : ''}
            ${h.location ? `<span class="badge badge-success">📌 ${h.location}</span>` : ''}
            ${gpsTag}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <span style="font-size:0.72rem;color:var(--text-light)">${formatDate(h.created_at)}</span>
          <button class="action-btn action-btn-danger" onclick="deleteHospital('${h.id}')">🗑️ Remove</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('[Admin] loadHospitals error:', err);
    if (container) container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
  }
}

async function addHospital(e) {
  e.preventDefault();
  const name      = document.getElementById('hName')?.value?.trim();
  const city      = document.getElementById('hCity')?.value?.trim();
  const address   = document.getElementById('hAddress')?.value?.trim();
  const phone     = document.getElementById('hPhone')?.value?.trim()    || null;
  const state     = document.getElementById('hState')?.value?.trim()    || null;
  const location  = document.getElementById('hLocation')?.value?.trim() || null;
  const emergency = document.getElementById('hEmergency')?.value === 'true';
  const latVal    = document.getElementById('hLatitude')?.value;
  const lngVal    = document.getElementById('hLongitude')?.value;
  const latitude  = latVal  ? parseFloat(latVal)  : null;
  const longitude = lngVal  ? parseFloat(lngVal)  : null;

  const errEl  = document.getElementById('hospitalFormError');
  const errMsg = document.getElementById('hospitalFormErrMsg');
  if (errEl) errEl.style.display = 'none';

  if (!name || !city || !address) {
    if (errEl) { errEl.style.display = 'flex'; errMsg.textContent = 'Please fill all required fields (Name, City, Address).'; }
    return;
  }

  const btn = document.getElementById('addHospitalBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Registering…'; }

  try {
    const { error } = await supabase.from('hospitals').insert({
      name, city, address, phone, state, location, emergency, latitude, longitude
    });
    if (error) throw error;
    showToast(`${name} registered successfully! 🏥`, 'success');
    document.getElementById('hospitalForm')?.reset();
    await loadHospitals();
  } catch (err) {
    console.error('[Admin] addHospital error:', err.message);
    if (errEl) { errEl.style.display = 'flex'; errMsg.textContent = err.message; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🏥 Register Hospital'; }
  }
}

async function deleteHospital(id) {
  if (!confirm('Remove this hospital from the platform?')) return;
  const card = document.getElementById('hosp-' + id);
  if (card) card.style.opacity = '0.5';
  try {
    const { error } = await supabase.from('hospitals').delete().eq('id', id);
    if (error) throw error;
    showToast('Hospital removed ✅', 'success');
    await loadHospitals();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (card) card.style.opacity = '1';
  }
}

// ─── Create Admin (REMOVED — Security) ───────────────────────
// Admin accounts must be created manually via Supabase Auth dashboard.
// openCreateAdminModal / handleCreateAdmin / closeCreateAdminModal removed.



// ─── AI System Monitoring ─────────────────────────────────────
async function loadAILogs() {
  const container = document.getElementById('aiLogsContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const { data, error } = await supabase
      .from('ai_logs')
      .select('*, profiles(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    aiLogs = data || [];

    const today = new Date().toDateString();
    const todayCount = aiLogs.filter(l => new Date(l.created_at).toDateString() === today).length;
    setEl('aiTotalQueries', aiLogs.length);
    setEl('aiTodayQueries', todayCount);
    setEl('aiUniqueUsers', new Set(aiLogs.map(l => l.user_id).filter(Boolean)).size);

    if (aiLogs.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🤖</div><h3>No AI queries yet</h3><p>AI symptom queries will appear here when patients use the AI feature.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead><tr><th>User</th><th>Query / Symptoms</th><th>Diagnosis</th><th>Time</th></tr></thead>
          <tbody>
            ${aiLogs.map(log => {
              const userName = log.profiles
                ? `${log.profiles.first_name||''} ${log.profiles.last_name||''}`.trim()
                : 'Anonymous';
              const symptoms = Array.isArray(log.symptoms) ? log.symptoms.join(', ') : '—';
              return `
                <tr>
                  <td>
                    <div style="font-weight:600;font-size:0.85rem">${userName}</div>
                    <div style="font-size:0.72rem;color:var(--text-light)">${log.user_id ? log.user_id.substring(0,8)+'…' : 'Guest'}</div>
                  </td>
                  <td style="max-width:260px">
                    <div style="font-size:0.85rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${log.query||'—'}</div>
                    ${symptoms !== '—' ? `<div style="font-size:0.72rem;color:var(--text-light);margin-top:2px">🔍 ${symptoms}</div>` : ''}
                  </td>
                  <td style="font-size:0.82rem;max-width:200px">
                    <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
                      ${log.diagnosis || log.response || '—'}
                    </span>
                  </td>
                  <td style="font-size:0.75rem;color:var(--text-light);white-space:nowrap">${timeAgo(log.created_at)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div style="font-size:2rem">⚠️</div><p style="color:var(--text-light)">${err.message}</p></div>`;
  }
}

// ─── Content Management ───────────────────────────────────────
const MEDICAL_CATEGORIES = [
  { icon:'🫀', name:'Cardiology',       desc:'Heart & cardiovascular conditions' },
  { icon:'🧠', name:'Neurology',        desc:'Brain, spine & nervous system' },
  { icon:'🦴', name:'Orthopedics',      desc:'Bones, joints & musculoskeletal' },
  { icon:'👶', name:'Pediatrics',       desc:'Children\'s health & development' },
  { icon:'🌸', name:'Gynecology',       desc:'Women\'s reproductive health' },
  { icon:'👁️', name:'Ophthalmology',    desc:'Eyes & vision disorders' },
  { icon:'👂', name:'ENT',             desc:'Ear, nose & throat conditions' },
  { icon:'🫁', name:'Pulmonology',      desc:'Respiratory & lung diseases' },
  { icon:'🧬', name:'Oncology',         desc:'Cancer diagnosis & treatment' },
  { icon:'🩺', name:'General Medicine', desc:'Primary & preventive care' },
  { icon:'🦷', name:'Dentistry',        desc:'Oral & dental health' },
  { icon:'🧴', name:'Dermatology',      desc:'Skin, hair & nail conditions' },
];

function loadContentPanel() {
  renderMedicalCategories();
  renderPlatformStats();
}

function renderMedicalCategories() {
  const container = document.getElementById('medicalCategoriesGrid');
  if (!container) return;
  container.innerHTML = MEDICAL_CATEGORIES.map((c) => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px;background:white;border:1px solid var(--border);border-radius:var(--radius-sm);transition:var(--transition)" onmouseover="this.style.boxShadow='var(--card-shadow)'" onmouseout="this.style.boxShadow=''">
      <div style="font-size:1.6rem;flex-shrink:0">${c.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:0.85rem">${c.name}</div>
        <div style="font-size:0.72rem;color:var(--text-light)">${c.desc}</div>
      </div>
      <span class="status-pill status-approved" style="font-size:0.68rem">● Active</span>
    </div>
  `).join('');
}

async function renderPlatformStats() {
  const el = document.getElementById('platformStatsSummary');
  if (!el) return;
  try {
    const [
      { count: medCount  },
      { count: apptCount },
      { count: patCount  },
      { count: aiCount   },
    ] = await Promise.all([
      supabase.from('doctors').select('*',{count:'exact',head:true}).eq('is_approved', true),
      supabase.from('appointments').select('*',{count:'exact',head:true}),
      supabase.from('profiles').select('*',{count:'exact',head:true}).eq('role','patient'),
      supabase.from('ai_logs').select('*',{count:'exact',head:true}),
    ]);
    el.innerHTML = [
      { label:'Active Doctors', val: medCount||0, color:'#10b981', icon:'👨‍⚕️' },
      { label:'Total Patients', val: patCount||0, color:'var(--primary)', icon:'🩺' },
      { label:'Appointments',   val: apptCount||0, color:'#7c3aed', icon:'📅' },
      { label:'AI Queries',     val: aiCount||0,  color:'#f59e0b', icon:'🤖' },
    ].map(s => `
      <div style="flex:1;min-width:120px;text-align:center;padding:1.25rem;background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:1.5rem;margin-bottom:4px">${s.icon}</div>
        <div style="font-size:1.6rem;font-weight:800;color:${s.color}">${s.val}</div>
        <div style="font-size:0.72rem;color:var(--text-light);margin-top:2px;text-transform:uppercase;letter-spacing:0.05em">${s.label}</div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<p style="color:var(--text-light)">Failed to load stats.</p>`;
  }
}

// ─── Overview Panel ───────────────────────────────────────────
function loadOverviewPanels() {
  // Pending doctors summary
  const c = document.getElementById('overviewPendingDoctors');
  if (c) {
    if (pendingDoctors.length === 0) {
      c.innerHTML = `<div class="empty-state"><div style="font-size:2rem">✅</div><p style="margin-top:8px;font-size:0.85rem">No pending approvals</p></div>`;
    } else {
      c.innerHTML = pendingDoctors.slice(0,3).map(d => {
        const p = d.profiles || {};
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#fbbf24);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.85rem">${(p.first_name?.[0]||'')+(p.last_name?.[0]||'')}</div>
            <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">Dr. ${p.first_name||'—'} ${p.last_name||''}</div><div style="font-size:0.72rem;color:var(--text-light)">${d.specialization||'—'}</div></div>
            <span class="status-pill status-pending">● Pending</span>
          </div>
        `;
      }).join('') + (pendingDoctors.length>3 ? `<div style="text-align:center;padding:10px;font-size:0.8rem;color:var(--primary);cursor:pointer" onclick="switchAdminPanel('approvals')">+${pendingDoctors.length-3} more →</div>` : '');
    }
  }

  // Recent appointments
  const ac = document.getElementById('overviewRecentApts');
  if (ac) {
    if (allAppointments.length === 0) {
      ac.innerHTML = `<div class="empty-state"><div style="font-size:2rem">📅</div><p style="margin-top:8px;font-size:0.85rem">No appointments yet</p></div>`;
    } else {
      ac.innerHTML = allAppointments.slice(0,5).map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9">
          <div><div style="font-weight:600;font-size:0.85rem">${a.patient_name}</div><div style="font-size:0.72rem;color:var(--text-light)">${a.doctor_name||'—'} · ${formatDate(a.date)}</div></div>
          <span class="status-pill status-${a.status}">● ${a.status}</span>
        </div>
      `).join('');
    }
  }

  // Status breakdown
  const bd = document.getElementById('adminBreakdownStats');
  if (bd) {
    const statMap = { pending:['#fef3c7','#92400e'], confirmed:['#dbeafe','#1e40af'], completed:['#dcfce7','#166534'], rejected:['#fee2e2','#991b1b'], cancelled:['#f3f4f6','#4b5563'] };
    bd.innerHTML = Object.entries(statMap).map(([s,[b,col]]) => {
      const count = allAppointments.filter(a => a.status===s).length;
      return `<div style="flex:1;min-width:100px;text-align:center;padding:1rem;background:${b};border-radius:var(--radius-sm)"><div style="font-size:1.5rem;font-weight:800;color:${col}">${count}</div><div style="font-size:0.72rem;font-weight:700;color:${col};margin-top:4px;text-transform:uppercase">${s}</div></div>`;
    }).join('');
  }

  // Mirror stats to system panel
  ['adminStatPatients','adminStatDoctors','adminStatAppts','adminStatPending'].forEach((id,i) => {
    const mirrors=['adminStatPatients2','adminStatDoctors2','adminStatAppts2','adminStatPending2'];
    const src=document.getElementById(id), dst=document.getElementById(mirrors[i]);
    if(src&&dst) dst.textContent=src.textContent;
  });
}

// ─── Activity Log ──────────────────────────────────────────────
async function loadActivityLog() {
  const container = document.getElementById('activityLog');
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('patient_name,doctor_name,status,created_at')
      .order('created_at',{ascending:false})
      .limit(10);
    if (error) throw error;
    const items = data || [];
    if (items.length === 0) {
      container.innerHTML = `<p style="color:var(--text-light);font-size:0.85rem">No recent activity</p>`;
      return;
    }
    container.innerHTML = items.map(a => `
      <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9">
        <div style="width:8px;height:8px;border-radius:50%;background:${a.status==='completed'?'#10b981':a.status==='rejected'?'#ef4444':'#3b82f6'};margin-top:6px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:0.85rem;color:var(--text-medium)">📅 ${a.patient_name} → ${a.doctor_name||'Doctor'}</div>
          <div style="font-size:0.72rem;color:var(--text-light);margin-top:2px">${timeAgo(a.created_at)} · <span class="status-pill status-${a.status}" style="font-size:0.65rem;padding:2px 6px">● ${a.status}</span></div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:var(--text-light);font-size:0.85rem">Failed to load activity</p>`;
  }
}

// ─── System Health ────────────────────────────────────────────
async function checkSystemHealth() {
  const el = document.getElementById('systemStatus');
  if (!el) return;
  try {
    const { error } = await supabase.from('profiles').select('id',{count:'exact',head:true});
    if (!error) el.innerHTML = `<span class="status-pill status-approved">● Supabase Online</span><span style="font-size:0.8rem;color:var(--text-light);margin-left:10px">PostgreSQL 17 · ap-south-1</span>`;
    else throw error;
  } catch {
    el.innerHTML = `<span class="status-pill status-blocked">● Connection Error</span>`;
  }
}

function checkSocketStatus() {
  const el = document.getElementById('socketStatus');
  if (!el) return;
  el.className = 'status-pill status-approved';
  el.textContent = '● Supabase Realtime';
}

// ─── Logout ───────────────────────────────────────────────────
async function adminLogout() { await supabaseLogout(); }

// ─── Helpers ──────────────────────────────────────────────────
function setEl(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
function formatDate(d) { if(!d) return '—'; return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function timeAgo(d) {
  if(!d) return '';
  const diff=Date.now()-new Date(d).getTime();
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000), dy=Math.floor(diff/86400000);
  if(m<1) return 'just now';
  if(m<60) return `${m}m ago`;
  if(h<24) return `${h}h ago`;
  return `${dy}d ago`;
}

// ═══════════════════════════════════════════════════════════════
// MEDICINE DATABASE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// ─── Load Medicines List ──────────────────────────────────────
async function loadMedicines() {
  const container = document.getElementById('medicinesList');
  const badge     = document.getElementById('medicineTotalBadge');
  if (container) container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('medicine_name', { ascending: true });
    if (error) throw error;

    const meds = data || [];
    if (badge) badge.textContent = meds.length + ' medicine' + (meds.length !== 1 ? 's' : '');

    if (!container) return;
    if (meds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💊</div>
          <h3>No medicines in database</h3>
          <p>Use the form above to add your first medicine.</p>
        </div>`;
      return;
    }

    container.innerHTML = meds.map(m => {
      const safe = (s) => (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const safeAttr = (s) => (s||'').replace(/'/g,"\\'").replace(/</g,'').replace(/>/g,'');
      return `<div id="med-card-${m.id}" style="border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;background:white;margin-bottom:0.75rem;display:flex;gap:1rem;align-items:flex-start;transition:var(--transition)" onmouseover="this.style.boxShadow='var(--card-shadow)'" onmouseout="this.style.boxShadow=''">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0">💊</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px">${safe(m.medicine_name)}</div>
          <div style="font-size:0.8rem;color:var(--text-light);margin-bottom:8px">🎯 ${safe(m.used_for)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${m.age_group ? `<span class="badge badge-primary">👥 ${safe(m.age_group)}</span>` : ''}
            ${m.dosage    ? `<span class="badge badge-success">💉 ${safe(m.dosage)}</span>` : ''}
            ${m.added_by_admin ? '<span class="badge" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0">✅ Admin Verified</span>' : '<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">👨‍⚕️ Doctor Entry</span>'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <span style="font-size:0.72rem;color:var(--text-light)">${formatDate(m.created_at)}</span>
          <div style="display:flex;gap:6px">
            <button class="action-btn action-btn-primary" onclick="editMedicine('${m.id}','${safeAttr(m.medicine_name)}','${safeAttr(m.used_for)}','${safeAttr(m.age_group)}','${safeAttr(m.dosage)}','${safeAttr(m.side_effects)}','${safeAttr(m.precautions)}')">✏️ Edit</button>
            <button class="action-btn action-btn-danger" onclick="deleteMedicine('${m.id}')">🗑️ Delete</button>
          </div>
        </div>
      </div>`;
    }).join('');


  } catch (err) {
    console.error('[Admin] loadMedicines:', err.message);
    if (container) container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
  }
}

// ─── Add Medicine ─────────────────────────────────────────────
async function addMedicine(e) {
  e.preventDefault();
  const name        = document.getElementById('mName')?.value?.trim();
  const usedFor     = document.getElementById('mUsedFor')?.value?.trim();
  const ageGroup    = document.getElementById('mAgeGroup')?.value?.trim()    || null;
  const dosage      = document.getElementById('mDosage')?.value?.trim()      || null;
  const sideEffects = document.getElementById('mSideEffects')?.value?.trim() || null;
  const precautions = document.getElementById('mPrecautions')?.value?.trim() || null;

  if (!name || !usedFor) { showToast('Medicine name and "Used For" are required.', 'warning'); return; }

  const btn = document.getElementById('addMedicineBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Adding…'; }

  try {
    const { error } = await supabase.from('medicines').insert({
      medicine_name:  name,
      used_for:       usedFor,
      age_group:      ageGroup,
      dosage,
      side_effects:   sideEffects,
      precautions,
      added_by_admin: true,
      added_by:       currentAdminUser?.id || null,
    });
    if (error) throw error;
    showToast(`💊 "${name}" added to medicine database!`, 'success');
    document.getElementById('medicineForm')?.reset();
    await loadMedicines();
  } catch (err) {
    console.error('[Admin] addMedicine:', err.message);
    showToast('Failed to add: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💊 Add Medicine'; }
  }
}

// ─── Delete Medicine ──────────────────────────────────────────
async function deleteMedicine(id) {
  if (!confirm('Remove this medicine from the database?')) return;
  try {
    const { error } = await supabase.from('medicines').delete().eq('id', id);
    if (error) throw error;
    showToast('Medicine removed.', 'success');
    await loadMedicines();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ─── Edit Medicine (opens inline edit row) ────────────────────
function editMedicine(id, currentName, currentUsedFor, currentAgeGroup, currentDosage, currentSideEffects, currentPrecautions) {
  // Find the card and replace with an edit form
  const card = document.getElementById('med-card-' + id);
  if (!card) return;
  card.innerHTML = `
    <div style="flex:1">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">Medicine Name *</label>
          <input id="edit-name-${id}" class="form-control" type="text" value="${currentName}" style="margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">Used For *</label>
          <input id="edit-usedfor-${id}" class="form-control" type="text" value="${currentUsedFor}" style="margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">Age Group</label>
          <input id="edit-agegroup-${id}" class="form-control" type="text" value="${currentAgeGroup}" style="margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">Dosage</label>
          <input id="edit-dosage-${id}" class="form-control" type="text" value="${currentDosage}" style="margin-top:4px"/>
        </div>
        <div>
          <label style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">Side Effects</label>
          <textarea id="edit-sideeffects-${id}" class="form-control" rows="2" style="margin-top:4px">${currentSideEffects}</textarea>
        </div>
        <div>
          <label style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">Precautions</label>
          <textarea id="edit-precautions-${id}" class="form-control" rows="2" style="margin-top:4px">${currentPrecautions}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="saveEditMedicine('${id}')">💾 Save Changes</button>
        <button class="btn btn-outline btn-sm" onclick="loadMedicines()">✕ Cancel</button>
      </div>
    </div>`;
}

async function saveEditMedicine(id) {
  const name        = document.getElementById('edit-name-' + id)?.value?.trim();
  const usedFor     = document.getElementById('edit-usedfor-' + id)?.value?.trim();
  const ageGroup    = document.getElementById('edit-agegroup-' + id)?.value?.trim() || null;
  const dosage      = document.getElementById('edit-dosage-' + id)?.value?.trim() || null;
  const sideEffects = document.getElementById('edit-sideeffects-' + id)?.value?.trim() || null;
  const precautions = document.getElementById('edit-precautions-' + id)?.value?.trim() || null;

  if (!name || !usedFor) { showToast('Name and "Used For" are required.', 'warning'); return; }

  try {
    const { error } = await supabase.from('medicines').update({
      medicine_name: name, used_for: usedFor, age_group: ageGroup,
      dosage, side_effects: sideEffects, precautions,
    }).eq('id', id);
    if (error) throw error;
    showToast('✅ Medicine updated successfully!', 'success');
    await loadMedicines();
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

// ─── Load Unknown Medicines (flagged by scanner) ──────────────
async function loadUnknownMedicines() {
  const container = document.getElementById('unknownMedicinesList');
  if (container) container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    const { data, error } = await supabase
      .from('unknown_medicines')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const items = data || [];
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>No unknown medicines flagged</h3>
          <p>When users scan medicines not in the database, they appear here for review.</p>
        </div>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <div style="border:1px solid #fde68a;border-radius:var(--radius);padding:1rem 1.25rem;background:#fffbeb;margin-bottom:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.3rem">⚠️</span>
          <div>
            <div style="font-weight:700;font-size:0.9rem">${(item.detected_name||'Unknown').replace(/</g,'&lt;')}</div>
            <div style="font-size:0.75rem;color:var(--text-light)">Scanned: ${formatDate(item.scanned_at)}</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="prefillMedicineForm('${(item.detected_name||'').replace(/'/g,"\\'")}')"
          style="font-size:0.78rem">➕ Add to DB</button>
      </div>`).join('');

  } catch (err) {
    console.error('[Admin] loadUnknownMedicines:', err.message);
    if (container) container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
  }
}

// ─── Prefill form from unknown medicine ───────────────────────
function prefillMedicineForm(name) {
  const input = document.getElementById('mName');
  if (input) {
    input.value = name;
    input.focus();
    document.getElementById('medicineForm')?.scrollIntoView({ behavior: 'smooth' });
    showToast(`Prefilled "${name}" — add details and submit.`, 'info', 4000);
  }
}
