/* ============================================================
   APPOINTMENT.JS — 100% Supabase-powered Booking System
   ============================================================ */

let allDoctors       = [];   // loaded from Supabase
let filteredDoctors  = [];   // after search/filter
let selectedDoctor   = null; // currently selected for booking
let currentPatient   = null; // logged-in user profile

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Get current user session (non-blocking — guests can still browse)
  currentPatient = getUser();

  // Set date minimum to today
  const dateInput = document.getElementById('apptDate');
  if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

  // Load doctors from Supabase
  await fetchDoctors();

  // Load patient's appointments if logged in
  if (currentPatient?.id) {
    await loadMyAppointments();
    document.getElementById('myApptsSection')?.style?.setProperty('display', 'block');
    prefillBookingForm();
  }

  // Subscribe to realtime updates for patient's appointments
  if (currentPatient?.id) {
    supabase
      .channel('my-appointments')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `patient_id=eq.${currentPatient.id}`,
      }, () => loadMyAppointments())
      .subscribe();
  }
});

// ─── Fetch Approved Doctors from Supabase ─────────────────────
async function fetchDoctors() {
  const grid = document.getElementById('doctorGrid');
  if (grid) grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:3rem">
      <div class="spinner" style="margin:0 auto 1rem"></div>
      <div style="color:var(--text-light)">Loading available doctors…</div>
    </div>`;

  try {
    // Join doctors table with profiles to get names
    // Only show doctors who are approved AND have availability set to 'available'
    const { data, error } = await supabase
      .from('doctors')
      .select(`
        id, specialization, experience, consultation_fee,
        hospital, bio, available_slots, is_available, availability_status,
        profiles:user_id ( id, first_name, last_name )
      `)
      .eq('is_approved', true)
      .eq('availability_status', 'available');

    if (error) throw error;

    allDoctors = (data || []).map(d => ({
      dbId:       d.id,
      userId:     d.profiles?.id  || null,
      name:       `Dr. ${d.profiles?.first_name||''} ${d.profiles?.last_name||''}`.trim(),
      spec:       d.specialization   || 'General Physician',
      exp:        d.experience       || 'N/A',
      fee:        d.consultation_fee || 0,
      hospital:   d.hospital         || 'N/A',
      bio:        d.bio              || '',
      slots:      Array.isArray(d.available_slots) ? d.available_slots : [],
      available:  d.is_available,
      avatar:     '👨‍⚕️',
    }));

    filteredDoctors = [...allDoctors];
    renderDoctors(filteredDoctors);
  } catch (err) {
    console.error('[Appt] fetchDoctors error:', err);
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-light)">
        <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
        <h3>Failed to load doctors</h3>
        <p style="margin-bottom:1rem">${err.message}</p>
        <button class="btn btn-outline btn-sm" onclick="fetchDoctors()">🔄 Retry</button>
      </div>`;
  }
}

// ─── Render Doctor Cards ───────────────────────────────────────
function renderDoctors(doctors) {
  const grid  = document.getElementById('doctorGrid');
  const count = document.getElementById('doctorCount');
  if (!grid) return;
  if (count) count.textContent = doctors.length;

  if (doctors.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-light)">
        <div style="font-size:3rem;margin-bottom:1rem">🔍</div>
        <h3>No doctors found</h3>
        <p>Try adjusting your filters or check back later</p>
        <button class="btn btn-outline btn-sm" onclick="resetFilters()" style="margin-top:1rem">Clear Filters</button>
      </div>`;
    return;
  }

  grid.innerHTML = doctors.map(doc => `
    <div class="doctor-card">
      <div class="doctor-card-top">
        <div class="doctor-avatar">${doc.avatar}</div>
        <div class="doctor-info">
          <h3>${doc.name}</h3>
          <div class="spec">${doc.spec}</div>
          <div class="doctor-rating">⭐⭐⭐⭐⭐ Verified Doctor</div>
        </div>
      </div>
      <div class="doctor-card-body">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:0.75rem">
          <span class="badge badge-primary">🏥 ${doc.hospital}</span>
          ${doc.exp !== 'N/A' ? `<span class="badge badge-success">✅ ${doc.exp} exp</span>` : ''}
          ${doc.fee > 0 ? `<span class="badge" style="background:rgba(245,158,11,0.1);color:var(--warning)">💰 ₹${doc.fee}</span>` : ''}
        </div>
        ${doc.bio ? `<p style="font-size:0.78rem;color:var(--text-medium);margin-bottom:0.75rem;line-height:1.5">${doc.bio.slice(0,100)}${doc.bio.length>100?'…':''}</p>` : ''}
        ${doc.slots.length > 0 ? `
          <div style="font-size:0.78rem;color:var(--text-light);margin-bottom:6px;font-weight:600">Available Slots:</div>
          <div class="time-slots">
            ${doc.slots.slice(0, 4).map(slot => `
              <span class="time-slot" onclick="selectSlot(this, '${doc.dbId}', '${slot}')" data-docid="${doc.dbId}">${slot}</span>
            `).join('')}
            ${doc.slots.length > 4 ? `<span class="time-slot" style="background:var(--bg);cursor:default">+${doc.slots.length - 4} more</span>` : ''}
          </div>
        ` : '<div style="font-size:0.78rem;color:var(--text-light)">Slots available on booking</div>'}
        <button class="btn btn-primary" style="width:100%;margin-top:1rem;padding:10px"
                onclick="openBookingModal('${doc.dbId}')">
          📅 Book Appointment
        </button>
      </div>
    </div>
  `).join('');
}

// ─── Time Slot Click ───────────────────────────────────────────
function selectSlot(el, docDbId, slot) {
  document.querySelectorAll(`.time-slot[data-docid="${docDbId}"]`).forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  // Pre-select in modal time dropdown if already open
  const apptTime = document.getElementById('apptTime');
  if (apptTime) {
    for (let opt of apptTime.options) {
      if (opt.value === slot) { opt.selected = true; break; }
    }
  }
}

// ─── Filter Doctors ────────────────────────────────────────────
function filterDoctors() {
  const search = (document.getElementById('searchDoctor')?.value || '').toLowerCase();
  const spec   = document.getElementById('filterSpec')?.value || '';

  filteredDoctors = allDoctors.filter(d => {
    const matchSearch = !search ||
      d.name.toLowerCase().includes(search) ||
      d.spec.toLowerCase().includes(search) ||
      d.hospital.toLowerCase().includes(search);
    const matchSpec = !spec || d.spec === spec;
    return matchSearch && matchSpec;
  });
  renderDoctors(filteredDoctors);
}

function resetFilters() {
  const s  = document.getElementById('searchDoctor');
  const sp = document.getElementById('filterSpec');
  if (s)  s.value  = '';
  if (sp) sp.value = '';
  filteredDoctors = [...allDoctors];
  renderDoctors(filteredDoctors);
}

// ─── Booking Modal ─────────────────────────────────────────────
function openBookingModal(docDbId) {
  selectedDoctor = allDoctors.find(d => d.dbId === docDbId);
  if (!selectedDoctor) { showToast('Doctor not found. Please refresh the page.', 'warning'); return; }

  // Populate doctor info card
  const info = document.getElementById('selectedDoctorInfo');
  if (info) {
    info.innerHTML = `
      <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));
                  display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">
        ${selectedDoctor.avatar}
      </div>
      <div>
        <div style="font-weight:700">${selectedDoctor.name}</div>
        <div style="font-size:0.82rem;color:var(--primary)">${selectedDoctor.spec}</div>
        <div style="font-size:0.8rem;color:var(--text-light)">🏥 ${selectedDoctor.hospital}${selectedDoctor.fee > 0 ? ` · ₹${selectedDoctor.fee} fee` : ''}</div>
      </div>`;
  }

  // Build time slot dropdown dynamically from doctor's slots
  const timeSelect = document.getElementById('apptTime');
  if (timeSelect) {
    const slots = selectedDoctor.slots.length > 0
      ? selectedDoctor.slots
      : ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM',
         '12:00 PM','02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','05:00 PM'];
    timeSelect.innerHTML = `<option value="">Select time slot</option>` +
      slots.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  // Pre-fill patient details from session
  prefillBookingForm();
  openModal('appointmentModal');
}

function prefillBookingForm() {
  const user = currentPatient || getUser();
  if (!user) return;
  const fullName = `${user.first_name||user.firstName||''} ${user.last_name||user.lastName||''}`.trim();
  setValue('patientName',  fullName);
  setValue('patientEmail', user.email || '');
  setValue('patientPhone', user.phone  || '');
}

// ─── Book Appointment (Supabase Insert) ───────────────────────
async function bookAppointment(e) {
  e.preventDefault();
  if (!selectedDoctor) return;

  const name   = getValue('patientName');
  const phone  = getValue('patientPhone');
  const email  = getValue('patientEmail');
  const date   = getValue('apptDate');
  const time   = getValue('apptTime');
  const reason = getValue('apptReason');

  if (!name || !phone || !email || !date || !time) {
    showToast('Please fill in all required fields', 'warning');
    return;
  }

  const btn = document.getElementById('confirmBookingBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Booking…'; }

  try {
    const user  = currentPatient || getUser();
    const refId = generateRefId();

    const appointmentRow = {
      reference_id:  refId,
      patient_id:    user?.id    || null,
      doctor_id:     selectedDoctor.dbId,
      patient_name:  name,
      patient_email: email,
      patient_phone: phone,
      doctor_name:   selectedDoctor.name,
      date:          date,
      time_slot:     time,
      reason:        reason || null,
      status:        'pending',
    };

    const { data, error } = await supabase
      .from('appointments')
      .insert(appointmentRow)
      .select()
      .single();

    if (error) throw error;

    // Notify the doctor
    if (selectedDoctor.userId) {
      await sendNotification(
        selectedDoctor.userId,
        'New Appointment Request',
        `${name} has booked an appointment on ${formatDate(date)} at ${time}.`,
        'info'
      );
    }

    closeModal('appointmentModal');
    showConfirmation(refId, name, date, time);
    document.getElementById('appointmentForm')?.reset();
    selectedDoctor = null;

    // Refresh patient's appointment list
    if (user?.id) await loadMyAppointments();

  } catch (err) {
    console.error('[Appt] bookAppointment error:', err);
    showToast('Booking failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm Booking'; }
  }
}

// ─── Confirmation Modal ────────────────────────────────────────
function showConfirmation(refId, patientName, date, time) {
  const details = document.getElementById('confirmDetails');
  if (details) {
    details.innerHTML = `
      <div style="display:grid;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:var(--text-light)">Reference ID</span>
          <strong style="font-family:monospace;font-size:1.1rem;color:var(--primary);background:#eff6ff;padding:4px 12px;border-radius:6px">${refId}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-light)">Doctor</span>
          <strong>${selectedDoctor?.name || '—'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-light)">Specialization</span>
          <strong>${selectedDoctor?.spec || '—'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-light)">Hospital</span>
          <strong>${selectedDoctor?.hospital || '—'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-light)">Patient</span>
          <strong>${patientName}</strong>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-light)">Date & Time</span>
          <strong>${formatDate(date)} at ${time}</strong>
        </div>
      </div>
      <div style="margin-top:1.25rem;background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;padding:1rem">
        <div style="font-weight:800;color:#92400e;margin-bottom:6px;font-size:0.9rem">⚠️ IMPORTANT — READ BEFORE VISITING</div>
        <p style="font-size:0.85rem;color:#78350f;line-height:1.6;margin:0">
          When you visit the hospital, please <strong>show your Reference Number
          <span style="font-family:monospace;background:#fde68a;padding:1px 6px;border-radius:4px">${refId}</span>
          at the reception</strong> to confirm your payment and connect with your doctor. Keep this number safe.
        </p>
      </div>`;
  }
  openModal('confirmModal');
  showToast('Appointment booked successfully! 🎉', 'success');
}

// ─── My Appointments (Patient History) ────────────────────────
async function loadMyAppointments() {
  const user = currentPatient || getUser();
  if (!user?.id) return;

  const container = document.getElementById('myApptsList');
  if (container) container.innerHTML = `
    <div style="text-align:center;padding:2rem">
      <div class="spinner" style="margin:0 auto 0.5rem"></div>
      <div style="font-size:0.82rem;color:var(--text-light)">Loading your appointments…</div>
    </div>`;

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const apts = data || [];
    if (!container) return;

    if (apts.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:2.5rem;color:var(--text-light)">
          <div style="font-size:2.5rem;margin-bottom:0.75rem">📅</div>
          <div style="font-weight:600;margin-bottom:4px">No appointments yet</div>
          <div style="font-size:0.83rem">Book your first appointment above!</div>
        </div>`;
      return;
    }

    container.innerHTML = apts.map(a => {
      const canCancel = ['pending','confirmed'].includes(a.status);
      const statusColors = {
        pending:   { bg:'#fef3c7', color:'#92400e', border:'#fde68a' },
        confirmed: { bg:'#dbeafe', color:'#1e40af', border:'#bfdbfe' },
        completed: { bg:'#dcfce7', color:'#166534', border:'#bbf7d0' },
        rejected:  { bg:'#fee2e2', color:'#991b1b', border:'#fecaca' },
        cancelled: { bg:'#f3f4f6', color:'#374151', border:'#e5e7eb' },
      };
      const sc = statusColors[a.status] || statusColors.cancelled;
      return `
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;background:white;
                    box-shadow:0 1px 3px rgba(0,0,0,0.05);transition:box-shadow 0.2s"
             onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'"
             onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-weight:700;font-size:1rem">${a.doctor_name || 'Doctor'}</div>
              <div style="font-size:0.8rem;color:var(--text-light);margin-top:2px">${formatDate(a.date)} · ${a.time_slot}</div>
              ${a.reason ? `<div style="font-size:0.8rem;color:var(--text-medium);margin-top:4px">📋 ${a.reason}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span style="font-size:0.72rem;font-weight:700;background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};padding:3px 10px;border-radius:99px">
                ● ${a.status.toUpperCase()}
              </span>
              <span style="font-family:monospace;font-size:0.75rem;color:var(--primary);background:#eff6ff;padding:2px 8px;border-radius:4px">${a.reference_id}</span>
            </div>
          </div>
          ${a.prescription ? `
            <div style="margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;font-size:0.82rem">
              <strong>💊 Prescription:</strong> ${a.prescription}
            </div>` : ''}
          ${canCancel ? `
            <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:flex-end">
              <button class="btn btn-outline btn-sm"
                      style="color:var(--danger);border-color:var(--danger);font-size:0.8rem;padding:6px 14px"
                      onclick="cancelAppointment('${a.id}', this)">
                🚫 Cancel Appointment
              </button>
            </div>` : ''}
        </div>`;
    }).join('');
  } catch (err) {
    console.error('[Appt] loadMyAppointments error:', err);
    if (container) container.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--danger)">
        Failed to load appointments: ${err.message}
        <br><button class="btn btn-outline btn-sm" style="margin-top:10px" onclick="loadMyAppointments()">🔄 Retry</button>
      </div>`;
  }
}

// ─── Cancel Appointment ────────────────────────────────────────
async function cancelAppointment(aptId, btn) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '⏳ Cancelling…';

  try {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', aptId);
    if (error) throw error;
    showToast('Appointment cancelled', 'success');
    await loadMyAppointments();
  } catch (err) {
    showToast('Cancel failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  const iso = d.includes('T') ? d : d + 'T00:00:00';
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function getValue(id)      { return (document.getElementById(id)?.value || '').trim(); }
function setValue(id, val) { const e = document.getElementById(id); if (e && val) e.value = val; }
