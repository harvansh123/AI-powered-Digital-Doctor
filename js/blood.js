/* ============================================================
   BLOOD.JS — Blood Donation System (Supabase-Powered)
   Table: blood_donors  (columns: name, blood_group, age, phone, city, availability_status)
   Table: blood_requests (columns: patient_name, blood_group, units, hospital, contact, urgency)
   ============================================================ */

/* ─── Guard: wait for Supabase to be ready ─────────────────── */
function getSupabaseClient() {
  if (typeof supabase !== 'undefined' && supabase) return supabase;
  if (typeof window.supabase !== 'undefined' && window.supabase && window.supabase.from) return window.supabase;
  if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
  console.error('[Blood] Supabase client not found — check script loading order.');
  return null;
}

let allDonors         = [];
let activeBloodFilter = 'all';

/* ─── Init ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const db = getSupabaseClient();
  if (!db) {
    showBloodError('Could not connect to database. Please refresh the page.');
    return;
  }
  fetchDonors();
});

/* ─── Fetch Donors ───────────────────────────────────────────── */
async function fetchDonors() {
  const db = getSupabaseClient();
  if (!db) return;

  const grid  = document.getElementById('donorGrid');
  const count = document.getElementById('donorCount');
  if (grid) grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-light)">
      <div class="spinner" style="margin:0 auto 1rem;width:36px;height:36px;border:3px solid #fecdd3;border-top-color:#dc2626;border-radius:50%;animation:spin 0.8s linear infinite"></div>
      <p>Loading donors from database…</p>
    </div>`;

  try {
    const { data, error } = await db
      .from('blood_donors')
      .select('id, name, blood_group, age, phone, city, availability_status, last_donated, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allDonors = data || [];
    if (count) count.textContent = allDonors.length;
    applyFilters();

  } catch (err) {
    console.error('[Blood] fetchDonors error:', err.message);
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-light)">
        <div style="font-size:3rem;margin-bottom:1rem">⚠️</div>
        <h3>Failed to load donors</h3>
        <p style="font-size:0.85rem;margin-bottom:1rem;color:var(--danger)">${err.message}</p>
        <button class="btn btn-primary btn-sm" onclick="fetchDonors()">🔄 Retry</button>
      </div>`;
  }
}

/* ─── Render Donors ──────────────────────────────────────────── */
function renderDonors(list) {
  const grid  = document.getElementById('donorGrid');
  const count = document.getElementById('donorCount');
  if (!grid) return;
  if (count) count.textContent = list.length;

  if (list.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-light)">
        <div style="font-size:3rem;margin-bottom:1rem">🩸</div>
        <h3>No Donors Found</h3>
        <p>Try a different blood group or city filter, or <button onclick="switchTab('register')" style="background:none;border:none;color:var(--primary);font-weight:600;cursor:pointer;font-size:inherit">become a donor</button> today!</p>
      </div>`;
    return;
  }

  const bloodGradients = {
    'A+':  'linear-gradient(135deg,#dc2626,#ef4444)',
    'A-':  'linear-gradient(135deg,#b91c1c,#dc2626)',
    'B+':  'linear-gradient(135deg,#7c3aed,#a78bfa)',
    'B-':  'linear-gradient(135deg,#6d28d9,#7c3aed)',
    'AB+': 'linear-gradient(135deg,#1d4ed8,#60a5fa)',
    'AB-': 'linear-gradient(135deg,#1e40af,#3b82f6)',
    'O+':  'linear-gradient(135deg,#059669,#34d399)',
    'O-':  'linear-gradient(135deg,#047857,#10b981)',
  };

  grid.innerHTML = list.map(donor => {
    const isAvail = donor.availability_status !== 'unavailable';
    const gradient = bloodGradients[donor.blood_group] || 'linear-gradient(135deg,#dc2626,#ef4444)';
    return `
      <div class="donor-card" style="border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;background:white;display:flex;gap:1rem;align-items:flex-start;transition:var(--transition)" onmouseover="this.style.boxShadow='var(--card-shadow-hover)'" onmouseout="this.style.boxShadow=''">
        <div style="width:56px;height:56px;border-radius:50%;background:${gradient};display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;color:white;flex-shrink:0;letter-spacing:-1px">${escHtml(donor.blood_group)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:4px">
            <h4 style="font-size:0.95rem;font-weight:700;margin:0">${escHtml(donor.name)}</h4>
            <span style="font-size:0.72rem;padding:3px 10px;border-radius:99px;font-weight:600;background:${isAvail ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'};color:${isAvail ? '#059669' : '#b45309'}">
              ${isAvail ? '✅ Available' : '⏸ Unavailable'}
            </span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-light);margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px">
            <span>🏙️ ${escHtml(donor.city)}</span>
            <span>🎂 Age ${donor.age}</span>
            ${donor.last_donated ? `<span>🗓️ Last: ${formatDonorDate(donor.last_donated)}</span>` : ''}
          </div>
          ${isAvail
            ? `<a href="tel:${donor.phone}" class="btn btn-sm" style="background:linear-gradient(135deg,#dc2626,#ef4444);color:white;font-size:0.78rem;padding:6px 14px;text-decoration:none;border-radius:var(--radius-full);display:inline-flex;align-items:center;gap:4px">📞 ${escHtml(donor.phone)}</a>`
            : `<span style="font-size:0.78rem;color:var(--text-light);font-style:italic">Currently unavailable for donation</span>`
          }
        </div>
      </div>`;
  }).join('');
}

function formatDonorDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const iso = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Filter / Search ────────────────────────────────────────── */
function filterByBlood(group) {
  activeBloodFilter = group;
  document.querySelectorAll('.blood-group-btn').forEach(btn => {
    const text = btn.textContent.trim().replace('−', '-');
    const isMatch = group === 'all' ? (text === 'All') : (text === group);
    btn.classList.toggle('active', isMatch);
  });
  applyFilters();
}

function searchDonors() { applyFilters(); }

function applyFilters() {
  const search = (document.getElementById('searchDonor')?.value || '').toLowerCase();
  const city   = (document.getElementById('cityFilter')?.value || '').toLowerCase();

  const filtered = allDonors.filter(d => {
    const matchBlood  = activeBloodFilter === 'all' || d.blood_group === activeBloodFilter;
    const matchCity   = !city || (d.city || '').toLowerCase() === city;
    const matchSearch = !search || (d.name || '').toLowerCase().includes(search) || (d.city || '').toLowerCase().includes(search);
    return matchBlood && matchCity && matchSearch;
  });

  renderDonors(filtered);
}

/* ─── Register Donor → INSERT ───────────────────────────────── */
async function registerDonor(e) {
  e.preventDefault();
  const db = getSupabaseClient();
  if (!db) { showToast('Database not connected. Please refresh.', 'error'); return; }

  const name     = document.getElementById('dname')?.value?.trim();
  const age      = parseInt(document.getElementById('dage')?.value);
  const blood    = document.getElementById('dblood')?.value;
  const phone    = document.getElementById('dphone')?.value?.trim();
  const city     = document.getElementById('dcity')?.value?.trim();
  const lastDate = document.getElementById('dlastdate')?.value || null;

  if (!name || !age || !blood || !phone || !city) {
    showToast('Please fill all required fields', 'warning'); return;
  }
  if (age < 18 || age > 65) {
    showToast('Age must be between 18 and 65 years', 'warning'); return;
  }

  const btn = document.querySelector('#donorForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Registering…'; }

  try {
    let userId = null;
    try {
      const { data: { user } } = await db.auth.getUser();
      userId = user?.id || null;
    } catch {}

    const { error } = await db.from('blood_donors').insert({
      user_id:             userId,
      name,
      blood_group:         blood,
      age,
      phone,
      city,
      last_donated:        lastDate || null,
      availability_status: 'available',
    });

    if (error) throw error;

    showToast(`✅ Thank you ${name}! You are now registered as a blood donor.`, 'success', 5000);
    document.getElementById('donorForm')?.reset();
    await fetchDonors();
    setTimeout(() => switchTab('donors'), 1800);

  } catch (err) {
    console.error('[Blood] registerDonor error:', err.message);
    showToast('Registration failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🩸 Register as Donor'; }
  }
}

/* ─── Request Blood → INSERT ─────────────────────────────────── */
async function submitBloodRequest(e) {
  e.preventDefault();
  const db = getSupabaseClient();
  if (!db) { showToast('Database not connected. Please refresh.', 'error'); return; }

  const name     = document.getElementById('rname')?.value?.trim();
  const blood    = document.getElementById('rblood')?.value;
  const units    = document.getElementById('runits')?.value;
  const hospital = document.getElementById('rhospital')?.value?.trim();
  const contact  = document.getElementById('rcontact')?.value?.trim();
  const urgency  = document.getElementById('rurgency')?.value;
  const notes    = document.getElementById('rnotes')?.value?.trim() || null;

  if (!name || !blood || !units || !hospital || !contact || !urgency) {
    showToast('Please fill all required fields', 'warning'); return;
  }

  const btn = document.querySelector('#requestForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Submitting…'; }

  try {
    let userId = null;
    try {
      const { data: { user } } = await db.auth.getUser();
      userId = user?.id || null;
    } catch {}

    const { error } = await db.from('blood_requests').insert({
      user_id:      userId,
      patient_name: name,
      blood_group:  blood,
      units:        String(units),
      hospital,
      contact,
      urgency,
      notes,
      status:       'open',
    });

    if (error) throw error;

    const refId = 'BLD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    showToast(`🩸 Blood request submitted! Ref: ${refId} — Matching donors will be notified.`, 'success', 6000);
    document.getElementById('requestForm')?.reset();

    if (urgency === 'critical') {
      setTimeout(() => showToast('⚠️ CRITICAL: Also call 108 or the nearest blood bank immediately!', 'warning', 8000), 2000);
    }

  } catch (err) {
    console.error('[Blood] submitBloodRequest error:', err.message);
    showToast('Failed to submit: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🆘 Submit Blood Request'; }
  }
}

/* ─── Helper: show error in donor grid ───────────────────────── */
function showBloodError(msg) {
  const grid = document.getElementById('donorGrid');
  if (grid) grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-light)">
      <div style="font-size:3rem;margin-bottom:1rem">⚠️</div>
      <h3>Connection Error</h3>
      <p style="color:var(--danger)">${msg}</p>
      <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="location.reload()">🔄 Reload Page</button>
    </div>`;
}

/* ─── Spinner CSS (injected) ─────────────────────────────────── */
const bloodStyle = document.createElement('style');
bloodStyle.textContent = `@keyframes spin{to{transform:rotate(360deg)}}`;
document.head.appendChild(bloodStyle);
