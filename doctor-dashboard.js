/* ============================================================
   DOCTOR-DASHBOARD.JS — Fully Supabase-powered Doctor Portal
   Auth → Approval Check → Data Fetch → Realtime
   ============================================================ */

let currentDoctorUser   = null;
let currentDoctorRecord = null;   // doctors table row
let allAppointments     = [];     // full list, filtered locally
let currentAptFilter    = 'all';
let realtimeChannel     = null;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Step 1: Auth guard — only 'doctor' role can access
  currentDoctorUser = await requireAuth('doctor');
  if (!currentDoctorUser) return;

  initSidebar();
  loadUserInfo();

  // Step 2: Fetch doctor record to check approval status
  await loadDoctorRecord();

  // Step 3: Block unapproved doctors
  if (!currentDoctorRecord || currentDoctorRecord.approval_status !== 'approved') {
    showPendingApprovalScreen();
    return;
  }

  // Step 4: Approved — load full dashboard
  switchDashPanel('overview');

  await Promise.allSettled([
    loadAppointments(),
    loadNotifications(),
  ]);

  loadProfile();
  loadAvailability();
  setupSlotManager();

  // Step 5: Realtime subscriptions
  realtimeChannel = subscribeToAppointments(currentDoctorRecord.id, () => {
    showToast('📅 Appointment updated!', 'info');
    loadAppointments();
  });
  subscribeToNotifications(currentDoctorUser.id, (notif) => {
    showToast(`🔔 ${notif.title}`, 'info');
    loadNotifications();
  });
});

// ─── Approval Pending Screen ──────────────────────────────────
function showPendingApprovalScreen() {
  const layout  = document.querySelector('.dashboard-layout');
  const pending = document.getElementById('pendingApprovalScreen');
  if (layout)  layout.style.display  = 'none';
  if (!pending) return;

  pending.style.display = 'flex';

  const status = currentDoctorRecord?.approval_status || 'pending';
  const isRejected = status === 'rejected';

  setEl('pendingStatusLabel', isRejected ? '🚫 Application Rejected' : '⏳ Awaiting Admin Approval');
  setEl('pendingMsg', isRejected
    ? 'Your doctor application was not approved. Please contact support or re-register with corrected details.'
    : 'Your registration has been received. An admin will review your credentials shortly. You will be notified once approved.'
  );
  setEl('pendingDoctorName', `Dr. ${currentDoctorUser.first_name||''} ${currentDoctorUser.last_name||''}`.trim());
  setEl('pendingEmail', currentDoctorUser.email || '');
  if (currentDoctorRecord) {
    setEl('pendingSpec', currentDoctorRecord.specialization || '');
  }
}

// ─── Load Doctor Record ───────────────────────────────────────
async function loadDoctorRecord() {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('user_id', currentDoctorUser.id)
      .single();
    if (!error && data) currentDoctorRecord = data;
  } catch (err) {
    console.warn('[Doctor] loadDoctorRecord error:', err);
  }
}

// ─── Sidebar ─────────────────────────────────────────────────
function initSidebar() {
  const toggle  = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('docSidebar');
  toggle?.addEventListener('click',  () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
  overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
}

function loadUserInfo() {
  const u = currentDoctorUser;
  const initials = ((u.first_name?.[0]||'') + (u.last_name?.[0]||'')).toUpperCase() || 'DR';
  const name     = `Dr. ${u.first_name||''} ${u.last_name||''}`.trim();
  document.querySelectorAll('.doc-user-initials').forEach(el => el.textContent = initials);
  document.querySelectorAll('.doc-user-name').forEach(el    => el.textContent = name);
  document.querySelectorAll('.doc-user-email').forEach(el   => el.textContent = u.email || '');
}

// ─── Panel Switching ──────────────────────────────────────────
function switchDashPanel(panel) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + panel)?.classList.add('active');
  document.getElementById('nav-' + panel)?.classList.add('active');

  const titles = {
    overview:      'Dashboard Overview',
    appointments:  'My Appointments',
    profile:       'Doctor Profile',
    prescriptions: 'Prescriptions & Notes',
    slots:         'Manage Time Slots',
    notifications: 'Notifications',
    medicines:     'Add Medicine Information',
  };
  document.querySelector('.dashboard-topbar-title').textContent = titles[panel] || 'Dashboard';
  document.getElementById('docSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');

  if (panel === 'prescriptions') setTimeout(loadPrescriptionsPanel, 100);
  if (panel === 'overview')      setTimeout(loadRecentAppointments, 100);
  if (panel === 'medicines')     setTimeout(docLoadMyMedicines, 100);
}

// ─── Appointments: Fetch All, Filter Locally ──────────────────
async function loadAppointments() {
  if (!currentDoctorRecord) return;

  const tbody = document.getElementById('appointmentsTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem">
    <div class="spinner" style="margin:0 auto;margin-bottom:8px"></div>
    <div style="font-size:0.82rem;color:var(--text-light)">Fetching appointments…</div>
  </td></tr>`;

  try {
    // Always fetch ALL appointments — filter client-side for display
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('doctor_id', currentDoctorRecord.id)
      .order('date', { ascending: false });

    if (error) throw error;
    allAppointments = data || [];
  } catch (err) {
    console.error('[Doctor] loadAppointments error:', err);
    allAppointments = [];
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--danger)">
      <div style="font-size:1.5rem;margin-bottom:8px">⚠️</div>
      Failed to load appointments: ${err.message}
      <br><button class="action-btn action-btn-primary" style="margin-top:10px" onclick="loadAppointments()">🔄 Retry</button>
    </td></tr>`;
    showToast('Failed to load appointments', 'error');
    return;
  }

  renderFilteredAppointments();
  updateStats();
  updateTabCounts();
}

function renderFilteredAppointments() {
  const search = (document.getElementById('aptSearch')?.value || '').toLowerCase();
  let list = currentAptFilter === 'all'
    ? allAppointments
    : allAppointments.filter(a => a.status === currentAptFilter);

  if (search) {
    list = list.filter(a =>
      a.patient_name?.toLowerCase().includes(search) ||
      a.reference_id?.toLowerCase().includes(search) ||
      a.reason?.toLowerCase().includes(search)
    );
  }
  renderAppointmentsTable(list);
}

function renderAppointmentsTable(list) {
  const tbody = document.getElementById('appointmentsTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    const label = currentAptFilter === 'all' ? 'No appointments yet' : `No ${currentAptFilter} appointments`;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-light)">
      <div style="font-size:2rem;margin-bottom:8px">📅</div>
      <div style="font-weight:600;margin-bottom:4px">${label}</div>
      <div style="font-size:0.8rem">Appointments from patients will appear here</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(apt => {
    const pidAttr = apt.patient_id ? `'${apt.patient_id}'` : 'null';
    return `
    <tr>
      <td><span class="badge badge-primary" style="font-size:0.72rem">${apt.reference_id}</span></td>
      <td>
        <div class="patient-name" style="cursor:pointer;color:var(--primary);text-decoration:underline;text-underline-offset:2px"
             onclick="openPatientModal(${pidAttr},'${apt.id}')">${apt.patient_name}</div>
        <div style="font-size:0.75rem;color:var(--text-light)">${apt.patient_email||''}</div>
      </td>
      <td style="font-size:0.85rem">${formatDate(apt.date)}</td>
      <td style="font-size:0.85rem">${apt.time_slot}</td>
      <td><span style="font-size:0.8rem;color:var(--text-medium)">${apt.reason||'—'}</span></td>
      <td><span class="status-pill status-${apt.status}">● ${apt.status}</span></td>
      <td>
        ${apt.status==='pending'
          ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
               <button class="action-btn action-btn-success" onclick="updateAppointmentStatus('${apt.id}','confirmed')">✓ Accept</button>
               <button class="action-btn action-btn-danger"  onclick="updateAppointmentStatus('${apt.id}','rejected')">✗ Reject</button>
             </div>`
          : ''}
        ${apt.status==='confirmed'
          ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
               <button class="action-btn action-btn-primary" onclick="openPrescriptionModal('${apt.id}')">📋 Prescribe</button>
               <button class="action-btn action-btn-success" onclick="updateAppointmentStatus('${apt.id}','completed')">✓ Done</button>
             </div>`
          : ''}
        ${apt.status==='completed'
          ? `<button class="action-btn action-btn-grey" onclick="openPrescriptionModal('${apt.id}')">👁 View Rx</button>`
          : ''}
        ${['rejected','cancelled'].includes(apt.status)
          ? `<span style="font-size:0.75rem;color:var(--text-light)">—</span>`
          : ''}
      </td>
    </tr>`;
  }).join('');
}

function updateStats() {
  const todayStr  = new Date().toISOString().split('T')[0];
  const pending   = allAppointments.filter(a => a.status === 'pending').length;
  const confirmed = allAppointments.filter(a => a.status === 'confirmed').length;
  const completed = allAppointments.filter(a => a.status === 'completed').length;
  const rejected  = allAppointments.filter(a => a.status === 'rejected').length;
  const today     = allAppointments.filter(a => a.date === todayStr).length;

  setEl('statTotal',     allAppointments.length);
  setEl('statPending',   pending);
  setEl('statCompleted', completed);
  setEl('statToday',     today);
  setEl('breakPending',   pending);
  setEl('breakConfirmed', confirmed);
  setEl('breakCompleted', completed);
  setEl('breakRejected',  rejected);
}

function updateTabCounts() {
  setEl('countAll',       allAppointments.length);
  setEl('countPending',   allAppointments.filter(a => a.status==='pending').length);
  setEl('countConfirmed', allAppointments.filter(a => a.status==='confirmed').length);
  setEl('countCompleted', allAppointments.filter(a => a.status==='completed').length);
  const cnt   = allAppointments.filter(a => a.status==='pending').length;
  const badge = document.getElementById('navPendingBadge');
  if (badge) { badge.textContent = cnt||''; badge.style.display = cnt > 0 ? 'inline' : 'none'; }
}

function filterAppointments(filter) {
  currentAptFilter = filter;
  document.querySelectorAll('.apt-filter-btn').forEach(b => {
    const isActive = b.dataset.filter === filter;
    b.style.color        = isActive ? 'var(--primary)'           : 'var(--text-light)';
    b.style.borderBottom = isActive ? '2px solid var(--primary)' : '2px solid transparent';
    b.style.fontWeight   = isActive ? '700'                      : '500';
  });
  renderFilteredAppointments();
}

function searchAppointments() { renderFilteredAppointments(); }

// ─── Update Appointment Status ────────────────────────────────
async function updateAppointmentStatus(id, newStatus) {
  // Optimistic: dim the row
  const rows = document.querySelectorAll(`[onclick*="${id}"]`);
  rows.forEach(el => el.closest('tr')?.style?.setProperty('opacity','0.5'));

  try {
    const { error } = await supabase
      .from('appointments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    // Notify the patient
    const apt = allAppointments.find(a => a.id === id);
    if (apt?.patient_id) {
      await sendNotification(
        apt.patient_id,
        `Appointment ${newStatus}`,
        `Your appointment on ${formatDate(apt.date)} at ${apt.time_slot} has been ${newStatus} by your doctor.`,
        newStatus === 'confirmed' ? 'success' : 'info'
      );
    }

    showToast(`Appointment ${newStatus} ✅`, 'success');
    await loadAppointments();
    loadRecentAppointments();
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
    rows.forEach(el => el.closest('tr')?.style?.removeProperty('opacity'));
  }
}

// ─── Prescription Modal ───────────────────────────────────────
let currentPrescAptId = null;

function openPrescriptionModal(aptId) {
  currentPrescAptId = aptId;
  const apt = allAppointments.find(a => a.id === aptId);
  if (!apt) return;

  setEl('prescPatientName', apt.patient_name);
  setEl('prescRefId',       apt.reference_id);
  setEl('prescDate',        `${formatDate(apt.date)} at ${apt.time_slot}`);
  setEl('prescReason',      apt.reason || '—');
  setValue('prescDiagnosis',   '');              // fresh each open
  setValue('prescriptionText', apt.prescription || '');
  setValue('consultNotes',     apt.consultation_notes || '');
  openModal('prescriptionModal');
}

async function savePrescription() {
  const diagnosis          = getValue('prescDiagnosis');
  const prescription       = getValue('prescriptionText');
  const consultation_notes = getValue('consultNotes');

  const btn = document.getElementById('savePrescBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

  try {
    const apt = allAppointments.find(a => a.id === currentPrescAptId);
    if (!apt) throw new Error('Appointment not found');

    // 1. Save prescription text to appointments table
    const { error: aptErr } = await supabase
      .from('appointments')
      .update({ prescription, consultation_notes, updated_at: new Date().toISOString() })
      .eq('id', currentPrescAptId);
    if (aptErr) throw aptErr;

    // 2. Save full record to medical_records table
    if (apt.patient_id && currentDoctorRecord) {
      const { data: existing } = await supabase
        .from('medical_records')
        .select('id')
        .eq('appointment_id', currentPrescAptId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('medical_records')
          .update({ diagnosis, prescription, notes: consultation_notes, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('medical_records')
          .insert({
            patient_id:     apt.patient_id,
            doctor_id:      currentDoctorRecord.id,
            appointment_id: currentPrescAptId,
            diagnosis,
            prescription,
            notes:          consultation_notes,
          });
      }
    }

    closeModal('prescriptionModal');
    showToast('Prescription saved! 📋', 'success');
    await loadAppointments();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save Prescription'; }
  }
}

// ─── Patient Details Modal ────────────────────────────────────
async function openPatientModal(patientId, aptId) {
  if (!patientId || patientId === 'null' || patientId === 'undefined') {
    showToast('Patient profile not linked yet', 'warning');
    return;
  }

  const modal = document.getElementById('patientModal');
  if (!modal) return;

  // Show modal with loading state
  setEl('patientModalName',   '⏳ Loading…');
  setEl('patientModalEmail',  '');
  setEl('patientModalPhone',  '');
  setEl('patientModalJoined', '');
  const tbody = document.getElementById('patientAptsBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1.5rem">
    <div class="spinner" style="margin:0 auto"></div></td></tr>`;
  openModal('patientModal');

  try {
    // Fetch patient profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, status, created_at')
      .eq('id', patientId)
      .single();
    if (error) throw error;

    const name = `${profile.first_name||''} ${profile.last_name||''}`.trim() || '—';
    setEl('patientModalName',   name);
    setEl('patientModalPhone',  profile.phone   || '—');
    setEl('patientModalJoined', `Member since ${formatDate(profile.created_at)}`);

    // Find email from current appointment
    const apt = allAppointments.find(a => a.id === aptId || a.patient_id === patientId);
    setEl('patientModalEmail', apt?.patient_email || '—');

    // Patient's history with this doctor
    const { data: history } = await supabase
      .from('appointments')
      .select('reference_id, date, time_slot, status, reason')
      .eq('patient_id', patientId)
      .eq('doctor_id', currentDoctorRecord.id)
      .order('date', { ascending: false })
      .limit(10);

    if (!tbody) return;
    const apts = history || [];
    if (apts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-light)">
        No previous appointments with this patient</td></tr>`;
      return;
    }
    tbody.innerHTML = apts.map(a => `
      <tr>
        <td><span class="badge badge-primary" style="font-size:0.7rem">${a.reference_id}</span></td>
        <td style="font-size:0.82rem">${formatDate(a.date)} · ${a.time_slot}</td>
        <td style="font-size:0.82rem">${a.reason||'—'}</td>
        <td><span class="status-pill status-${a.status}" style="font-size:0.7rem">● ${a.status}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    setEl('patientModalName', 'Failed to load patient data');
    console.error('[Doctor] openPatientModal error:', err);
  }
}

// ─── Profile ──────────────────────────────────────────────────
function loadProfile() {
  const u = currentDoctorUser;
  const d = currentDoctorRecord;
  setEl('profName',     `Dr. ${u.first_name||''} ${u.last_name||''}`.trim());
  setEl('profEmail',    u.email || '');
  setEl('profInitials', ((u.first_name?.[0]||'') + (u.last_name?.[0]||'')).toUpperCase() || 'DR');
  if (d) {
    setValue('profSpec',     d.specialization  || '');
    setValue('profExp',      d.experience      || '');
    setValue('profFee',      d.consultation_fee|| '');
    setValue('profHospital', d.hospital        || '');
    setValue('profBio',      d.bio             || '');
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true; btn.textContent = '⏳ Saving…';
  try {
    const { error } = await supabase.from('doctors').update({
      specialization:   getValue('profSpec'),
      experience:       getValue('profExp'),
      consultation_fee: Number(getValue('profFee')) || 0,
      hospital:         getValue('profHospital'),
      bio:              getValue('profBio'),
      updated_at:       new Date().toISOString(),
    }).eq('user_id', currentDoctorUser.id);
    if (error) throw error;
    showToast('Profile updated! ✅', 'success');
    await loadDoctorRecord();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Save Profile';
  }
}

// ─── Availability Toggle ──────────────────────────────────────
let currentAvailStatus = 'available';

function loadAvailability() {
  if (!currentDoctorRecord) return;
  currentAvailStatus = currentDoctorRecord.availability_status || 'available';
  updateAvailabilityUI(currentAvailStatus);
}

function updateAvailabilityUI(status) {
  const isAvailable = status === 'available';
  const toggle = document.getElementById('availToggle');
  const thumb  = document.getElementById('availToggleThumb');
  const label  = document.getElementById('availToggleLabel');
  const statusLabel = document.getElementById('availStatusLabel');

  if (toggle) {
    toggle.style.background = isAvailable ? '#10b981' : '#e2e8f0';
  }
  if (thumb) {
    thumb.style.left = isAvailable ? '27px' : '3px';
  }
  if (label) {
    label.textContent = isAvailable ? 'Available' : 'Unavailable';
    label.style.color = isAvailable ? '#059669' : '#94a3b8';
  }
  if (statusLabel) {
    statusLabel.textContent = isAvailable
      ? '✅ Patients can see and book you'
      : '⏸ Hidden from patient booking list';
    statusLabel.style.color = isAvailable ? '#059669' : '#f59e0b';
  }
}

async function toggleAvailability() {
  if (!currentDoctorRecord) return;
  const newStatus = currentAvailStatus === 'available' ? 'unavailable' : 'available';

  // Optimistic UI
  currentAvailStatus = newStatus;
  updateAvailabilityUI(newStatus);

  try {
    const { error } = await supabase
      .from('doctors')
      .update({ availability_status: newStatus, updated_at: new Date().toISOString() })
      .eq('user_id', currentDoctorUser.id);
    if (error) throw error;

    currentDoctorRecord.availability_status = newStatus;
    showToast(
      newStatus === 'available'
        ? '✅ You are now available for bookings'
        : '⏸ You are now hidden from patient bookings',
      newStatus === 'available' ? 'success' : 'warning'
    );
  } catch (err) {
    // Revert on failure
    currentAvailStatus = newStatus === 'available' ? 'unavailable' : 'available';
    updateAvailabilityUI(currentAvailStatus);
    showToast('Failed to update availability: ' + err.message, 'error');
  }
}

// ─── Slot Manager ─────────────────────────────────────────────
const ALL_SLOTS = [
  '08:00 AM','08:30 AM','09:00 AM','09:30 AM','10:00 AM','10:30 AM',
  '11:00 AM','11:30 AM','12:00 PM','12:30 PM','01:00 PM','01:30 PM',
  '02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM',
  '05:00 PM','05:30 PM',
];
let activeSlots = new Set(['09:00 AM','10:30 AM','02:00 PM','04:00 PM']);

function setupSlotManager() {
  if (currentDoctorRecord?.available_slots) activeSlots = new Set(currentDoctorRecord.available_slots);
  renderSlots();
}

function renderSlots() {
  const container = document.getElementById('slotsContainer');
  if (!container) return;
  container.innerHTML = ALL_SLOTS.map(slot => `
    <span class="slot-chip ${activeSlots.has(slot)?'active':''}" onclick="toggleSlot('${slot}',this)">
      ${activeSlots.has(slot)?'✓':'+'} ${slot}
    </span>
  `).join('');
}

function toggleSlot(slot, el) {
  if (activeSlots.has(slot)) {
    activeSlots.delete(slot);
    el.classList.remove('active');
    el.textContent = `+ ${slot}`;
  } else {
    activeSlots.add(slot);
    el.classList.add('active');
    el.textContent = `✓ ${slot}`;
  }
}

async function saveSlots() {
  const slots = [...activeSlots];
  try {
    const { error } = await supabase.from('doctors')
      .update({ available_slots: slots, updated_at: new Date().toISOString() })
      .eq('user_id', currentDoctorUser.id);
    if (error) throw error;
    showToast(`${slots.length} time slots saved! ✅`, 'success');
  } catch (err) {
    showToast('Failed to save slots: ' + err.message, 'error');
  }
}

function selectAllSlots() { ALL_SLOTS.forEach(s => activeSlots.add(s)); renderSlots(); }
function clearAllSlots()  { activeSlots.clear(); renderSlots(); }

// ─── Notifications ────────────────────────────────────────────
async function loadNotifications() {
  const container = document.getElementById('notifList');
  if (container) container.innerHTML = `<div class="loading-overlay"><div class="spinner"></div></div>`;

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', currentDoctorUser.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    const notifs = data || [];
    const unread = notifs.filter(n => !n.is_read).length;

    const badge = document.getElementById('notifBadgeCount');
    if (badge) { badge.textContent = unread||''; badge.style.display = unread>0?'flex':'none'; }
    const dot = document.getElementById('notifDot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';

    if (!container) return;
    if (notifs.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🔔</div>
        <h3>No notifications</h3>
        <p>Notifications about your appointments will appear here.</p>
      </div>`;
      return;
    }
    container.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read?'':'notif-item-unread'}">
        <div class="notif-icon">${n.type==='success'?'✅':n.type==='warning'?'⚠️':n.type==='error'?'❌':'📅'}</div>
        <div>
          <div class="notif-text"><strong>${n.title||''}</strong> ${n.message||''}</div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('[Doctor] loadNotifications error:', err);
    if (container) container.innerHTML = `<div class="empty-state"><p style="color:var(--text-light)">Failed to load notifications</p></div>`;
  }
}

async function markAllRead() {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentDoctorUser.id);
    showToast('All marked as read ✅', 'success');
    await loadNotifications();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── Recent Appointments (Overview) ──────────────────────────
function loadRecentAppointments() {
  const container = document.getElementById('recentAppointments');
  if (!container) return;
  const recent = allAppointments.slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div style="font-size:2rem">📅</div>
      <p style="margin-top:8px;font-size:0.85rem">No appointments yet</p>
    </div>`;
    return;
  }
  container.innerHTML = recent.map(a => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));
          display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.85rem;flex-shrink:0">
        ${(a.patient_name||'P').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:0.875rem">${a.patient_name}</div>
        <div style="font-size:0.75rem;color:var(--text-light)">${formatDate(a.date)} · ${a.time_slot}</div>
      </div>
      <span class="status-pill status-${a.status}">● ${a.status}</span>
    </div>
  `).join('');
}

// ─── Prescriptions Panel ──────────────────────────────────────
function loadPrescriptionsPanel() {
  const container = document.getElementById('prescriptionsList');
  if (!container) return;
  const withRx = allAppointments.filter(a => a.prescription);
  if (withRx.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">💊</div>
      <h3>No prescriptions yet</h3>
      <p>Prescriptions you write will appear here once added to confirmed appointments.</p>
    </div>`;
    return;
  }
  container.innerHTML = withRx.map(a => `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;margin-bottom:1rem;background:white;
         box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-weight:700">${a.patient_name}</div>
          <div style="font-size:0.75rem;color:var(--text-light)">${a.reference_id} · ${formatDate(a.date)}</div>
        </div>
        <span class="status-pill status-${a.status}">● ${a.status}</span>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--radius-sm);padding:12px;font-size:0.85rem;margin-bottom:8px">
        <strong>💊 Prescription:</strong> ${a.prescription}
      </div>
      ${a.consultation_notes ? `
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;font-size:0.82rem;color:var(--text-medium)">
          <strong>📝 Notes:</strong> ${a.consultation_notes}
        </div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="action-btn action-btn-grey" onclick="openPrescriptionModal('${a.id}')">✏️ Edit Rx</button>
      </div>
    </div>
  `).join('');
}

// ─── Logout ───────────────────────────────────────────────────
async function doctorLogout() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  await supabaseLogout();
}

// ─── Helpers ─────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  const iso = d.includes('T') ? d : d + 'T00:00:00';
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000), dy=Math.floor(diff/86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${dy}d ago`;
}
function setEl(id, val)    { const e=document.getElementById(id); if(e) e.textContent=String(val||''); }
function getValue(id)      { return (document.getElementById(id)?.value||'').trim(); }
function setValue(id, val) { const e=document.getElementById(id); if(e) e.value=val||''; }


// ═══════════════════════════════════════════════════════════════
// DOCTOR MEDICINE MANAGEMENT
// Rules: Doctor can ADD. Doctor can only DELETE/EDIT their own entries.
//        Admin entries (added_by_admin=true) are protected.
// ═══════════════════════════════════════════════════════════════

// ─── Add Medicine ──────────────────────────────────────────
async function docAddMedicine(e) {
  e.preventDefault();
  const name        = document.getElementById('docMName')?.value?.trim();
  const usedFor     = document.getElementById('docMUsedFor')?.value?.trim();
  const ageGroup    = document.getElementById('docMAgeGroup')?.value?.trim()    || null;
  const dosage      = document.getElementById('docMDosage')?.value?.trim()      || null;
  const sideEffects = document.getElementById('docMSideEffects')?.value?.trim() || null;
  const precautions = document.getElementById('docMPrecautions')?.value?.trim() || null;

  if (!name || !usedFor) {
    showToast('Medicine name and "Used For" are required.', 'warning');
    return;
  }

  const btn = document.getElementById('docAddMedBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

  try {
    const { error } = await supabase.from('medicines').insert({
      medicine_name:  name,
      used_for:       usedFor,
      age_group:      ageGroup,
      dosage,
      side_effects:   sideEffects,
      precautions,
      added_by_admin: false,
      added_by:       currentDoctorUser?.id || null,
    });
    if (error) throw error;
    showToast(`✅ "${name}" added to medicine database!`, 'success');
    document.getElementById('docMedicineForm')?.reset();
    await docLoadMyMedicines();
  } catch (err) {
    console.error('[Doctor] docAddMedicine:', err.message);
    showToast('Failed to add: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💊 Add Medicine'; }
  }
}

// ─── Load Medicines Added By This Doctor ────────────────────
async function docLoadMyMedicines() {
  const container = document.getElementById('docMedicinesList');
  const badge     = document.getElementById('docMedCountBadge');
  if (container) container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  try {
    // Fetch ALL medicines so doctor can see both their entries and admin entries (read-only for admin ones)
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const meds = data || [];
    if (badge) badge.textContent = meds.length + ' medicine' + (meds.length !== 1 ? 's' : '');

    if (!container) return;
    if (meds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💊</div>
          <h3>No medicines in database yet</h3>
          <p>Use the form above to add the first medicine entry.</p>
        </div>`;
      return;
    }

    container.innerHTML = meds.map(m => {
      const safe     = (s) => (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const isMyEntry = m.added_by === currentDoctorUser?.id;
      const isAdmin   = m.added_by_admin === true;
      const badgeTag  = isAdmin
        ? '<span class="badge" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0">✅ Admin Verified</span>'
        : isMyEntry
          ? '<span class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe">👨‍⚕️ My Entry</span>'
          : '<span class="badge" style="background:#faf5ff;color:#7c3aed;border:1px solid #e9d5ff">👨‍⚕️ Doctor Entry</span>';

      return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;background:white;margin-bottom:0.75rem;display:flex;gap:1rem;align-items:flex-start;transition:var(--transition)" onmouseover="this.style.boxShadow='var(--card-shadow)'" onmouseout="this.style.boxShadow=''">
        <div style="width:44px;height:44px;border-radius:50%;background:${isAdmin ? 'linear-gradient(135deg,#7c3aed,#a78bfa)' : 'linear-gradient(135deg,#10b981,#34d399)'};display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0">💊</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px">${safe(m.medicine_name)}</div>
          <div style="font-size:0.8rem;color:var(--text-light);margin-bottom:8px">🎯 ${safe(m.used_for)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${m.age_group ? `<span class="badge badge-primary">👥 ${safe(m.age_group)}</span>` : ''}
            ${m.dosage    ? `<span class="badge badge-success">💉 ${safe(m.dosage)}</span>` : ''}
            ${badgeTag}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
          <span style="font-size:0.72rem;color:var(--text-light)">${formatDate(m.created_at)}</span>
          ${isMyEntry ? `<button class="action-btn action-btn-danger" onclick="docDeleteMedicine('${m.id}')">🗑️ Delete</button>` : `<span style="font-size:0.72rem;color:var(--text-light);font-style:italic">Read-only</span>`}
        </div>
      </div>`;
    }).join('');

  } catch (err) {
    console.error('[Doctor] docLoadMyMedicines:', err.message);
    if (container) container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${err.message}</p></div>`;
  }
}

// ─── Delete Own Medicine ───────────────────────────────────────
async function docDeleteMedicine(id) {
  if (!confirm('Remove this medicine from the database?')) return;
  try {
    const { error } = await supabase.from('medicines').delete().eq('id', id);
    if (error) {
      // RLS will block deletion of admin entries or other doctors' entries
      if (error.code === '42501' || error.message.includes('policy')) {
        showToast('🚫 You can only delete medicines you added yourself.', 'error', 5000);
      } else {
        throw error;
      }
      return;
    }
    showToast('Medicine removed ✅', 'success');
    await docLoadMyMedicines();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}
