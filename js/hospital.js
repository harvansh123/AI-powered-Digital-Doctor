/* ============================================================
   HOSPITAL.JS — Nearby Hospital Finder (Admin-controlled via Supabase)
   Table: hospitals
   Columns: id, name, address, city, state, phone, location,
            emergency, latitude, longitude, created_at
   ============================================================ */

/* ─── Guard: safely get Supabase client ──────────────────────── */
function getDB() {
  if (typeof supabase !== 'undefined' && supabase && supabase.from) return supabase;
  if (typeof window.supabase !== 'undefined' && window.supabase && window.supabase.from) return window.supabase;
  if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
  console.error('[Hospital] Supabase client not found. Check script loading order.');
  return null;
}

let allHospitals      = [];
let filteredHospitals = [];
let userLocation      = null;   // { lat, lng }

/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const db = getDB();
  if (!db) {
    showHospitalError('Database connection failed. Please refresh the page.');
    return;
  }
  fetchHospitals();
});

/* ─── Fetch hospitals from Supabase ─────────────────────────── */
async function fetchHospitals() {
  const db = getDB();
  if (!db) return;

  const list  = document.getElementById('hospitalList');
  const count = document.getElementById('hospitalCount');

  if (list) list.innerHTML = `
    <div style="text-align:center;padding:3rem;color:var(--text-light)">
      <div class="hosp-spinner" style="margin:0 auto 1rem"></div>
      <p>Loading hospitals from database…</p>
    </div>`;

  try {
    const { data, error } = await db
      .from('hospitals')
      .select('id, name, address, city, state, phone, location, emergency, latitude, longitude, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allHospitals      = data || [];
    filteredHospitals = [...allHospitals];

    if (count) count.textContent =
      `Showing ${allHospitals.length} hospital${allHospitals.length !== 1 ? 's' : ''}`;

    renderHospitals(filteredHospitals);

  } catch (err) {
    console.error('[Hospital] fetchHospitals error:', err.message);
    showHospitalError(err.message);
  }
}

/* ─── Geolocation ────────────────────────────────────────────── */
function getLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser', 'warning');
    showManualSearch();
    return;
  }

  const banner = document.getElementById('locationBanner');
  if (banner) banner.innerHTML = `
    <span class="alert-icon">⏳</span>
    <div><strong>Detecting your location…</strong><br/>
    <span style="font-size:0.8rem">Please allow location access when prompted.</span></div>`;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      onLocationSuccess();
    },
    (err) => {
      const msgs = {
        1: 'Location access denied. Please enable location in browser settings.',
        2: 'Location unavailable. Try searching manually.',
        3: 'Location request timed out.',
      };
      showToast(msgs[err.code] || 'Location error', 'error');
      showManualSearch();
      const b = document.getElementById('locationBanner');
      if (b) {
        b.className = 'alert alert-warning';
        b.innerHTML = `<span class="alert-icon">⚠️</span><div>${msgs[err.code] || 'Could not get location'}</div>`;
      }
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function onLocationSuccess() {
  const banner = document.getElementById('locationBanner');
  if (banner) banner.style.display = 'none';

  const statusEl = document.getElementById('locationStatus');
  const textEl   = document.getElementById('locationText');
  if (statusEl) statusEl.style.display = 'flex';
  if (textEl)   textEl.textContent =
    `📍 Location detected! Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)} — Sorting by nearest hospital.`;

  showToast('📍 Location detected! Sorting hospitals by distance.', 'success');

  // Sort hospitals by distance
  if (allHospitals.length > 0) {
    filteredHospitals = sortByDistance([...allHospitals]);
    renderHospitals(filteredHospitals);
  }

  updateMapEmbed();
}

/* ─── Distance helpers ───────────────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByDistance(list) {
  if (!userLocation) return list;
  return list
    .map(h => ({
      ...h,
      _distance: (h.latitude && h.longitude)
        ? haversineKm(userLocation.lat, userLocation.lng, parseFloat(h.latitude), parseFloat(h.longitude))
        : Infinity
    }))
    .sort((a, b) => a._distance - b._distance);
}

/* ─── Map embed ──────────────────────────────────────────────── */
function updateMapEmbed() {
  if (!userLocation) return;
  const mapContainer = document.getElementById('mapContainer');
  if (!mapContainer) return;
  mapContainer.style.background = '';
  mapContainer.innerHTML = `
    <iframe
      width="100%" height="100%"
      style="border:0;border-radius:var(--radius)"
      loading="lazy" allowfullscreen
      src="https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}&z=14&output=embed">
    </iframe>`;
}

function openGoogleMaps() {
  const q = userLocation
    ? `https://www.google.com/maps/search/hospital+near+me/@${userLocation.lat},${userLocation.lng},14z`
    : 'https://www.google.com/maps/search/hospital+near+me';
  window.open(q, '_blank');
}

function showManualSearch() {
  const ms = document.getElementById('manualSearch');
  if (ms) ms.style.display = 'block';
}

/* ─── Filter / Search ────────────────────────────────────────── */
function filterHospitals(type) {
  document.querySelectorAll('[onclick^="filterHospitals"]').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline');
  });
  event?.target?.classList?.replace('btn-outline', 'btn-primary');

  if (type === 'all') {
    filteredHospitals = [...allHospitals];
  } else if (type === 'Emergency') {
    filteredHospitals = allHospitals.filter(h => h.emergency === true);
  } else {
    filteredHospitals = allHospitals.filter(h =>
      (h.city || '').toLowerCase() === type.toLowerCase()
    );
  }

  if (userLocation) filteredHospitals = sortByDistance(filteredHospitals);
  renderHospitals(filteredHospitals);
}

function searchHospitals() {
  const query = (document.getElementById('citySearch')?.value || '').toLowerCase();
  filteredHospitals = allHospitals.filter(h =>
    !query ||
    (h.name    || '').toLowerCase().includes(query) ||
    (h.address || '').toLowerCase().includes(query) ||
    (h.city    || '').toLowerCase().includes(query) ||
    (h.state   || '').toLowerCase().includes(query)
  );
  if (userLocation) filteredHospitals = sortByDistance(filteredHospitals);
  renderHospitals(filteredHospitals);
}

/* ─── Render Hospitals ───────────────────────────────────────── */
function renderHospitals(hospitals) {
  const list  = document.getElementById('hospitalList');
  const count = document.getElementById('hospitalCount');
  if (!list) return;

  if (count) count.textContent =
    `Showing ${hospitals.length} hospital${hospitals.length !== 1 ? 's' : ''}`;

  if (hospitals.length === 0) {
    list.innerHTML = `
      <div style="text-align:center;padding:4rem 2rem;color:var(--text-light);background:white;border-radius:var(--radius);border:1px solid var(--border)">
        <div style="font-size:3.5rem;margin-bottom:1rem">🏥</div>
        <h3 style="font-size:1.2rem;margin-bottom:0.5rem">No Hospitals Available Nearby</h3>
        <p style="font-size:0.875rem;margin-bottom:1.5rem">
          No hospitals have been registered in the system yet, or your search returned no results.
        </p>
        <p style="font-size:0.8rem;opacity:0.7">
          Hospitals are managed by the Admin. Contact the administrator to add hospitals.
        </p>
      </div>`;
    return;
  }

  list.innerHTML = hospitals.map((h, idx) => {
    const distTxt = (userLocation && h._distance !== undefined && h._distance !== Infinity)
      ? `<span class="badge" style="background:#eff6ff;color:#1d4ed8">📏 ${h._distance.toFixed(1)} km away</span>`
      : '';

    const emergBadge = h.emergency
      ? '<span class="badge" style="background:rgba(220,38,38,0.1);color:#dc2626;border:1px solid #fecaca">🚨 24/7 Emergency</span>'
      : '<span class="badge" style="background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0">No Emergency</span>';

    const nearest = (idx === 0 && userLocation && h._distance !== Infinity)
      ? '<span class="badge" style="background:linear-gradient(135deg,#059669,#10b981);color:white;font-weight:700">📍 Nearest</span>'
      : '';

    const mapUrl = (h.latitude && h.longitude)
      ? `https://www.google.com/maps/dir/${userLocation ? userLocation.lat + ',' + userLocation.lng : ''}/${h.latitude},${h.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((h.name || '') + ' ' + (h.address || '') + ' ' + (h.city || ''))}`;

    return `
      <div class="hospital-card" style="border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;background:white;display:flex;gap:1.25rem;align-items:flex-start;transition:var(--transition);margin-bottom:1rem"
           onmouseover="this.style.boxShadow='var(--card-shadow-hover)'" onmouseout="this.style.boxShadow=''">
        <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#1d4ed8,#60a5fa);display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">🏥</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div>
              <h3 style="font-size:1rem;font-weight:700;margin-bottom:2px">${escH(h.name)}</h3>
              <div style="font-size:0.8rem;color:var(--text-light)">📍 ${escH(h.address)}${h.city ? ', ' + escH(h.city) : ''}${h.state ? ', ' + escH(h.state) : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
              ${nearest}
              ${distTxt}
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            ${emergBadge}
            ${h.city ? `<span class="badge badge-primary">🏙️ ${escH(h.city)}</span>` : ''}
            ${h.location ? `<span class="badge badge-success">📌 ${escH(h.location)}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${h.phone
              ? `<a href="tel:${h.phone}" class="btn btn-outline btn-sm" style="font-size:0.8rem">📞 ${escH(h.phone)}</a>`
              : ''}
            <a href="${mapUrl}" target="_blank" class="btn btn-primary btn-sm" style="font-size:0.8rem">
              🗺️ ${userLocation && h.latitude && h.longitude ? 'Get Directions' : 'View on Map'}
            </a>
            <a href="appointment.html" class="btn btn-sm" style="background:linear-gradient(135deg,#7c3aed,#a78bfa);color:white;font-size:0.8rem">📅 Book Appointment</a>
          </div>
        </div>
      </div>`;
  }).join('');
}

function escH(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Error state ────────────────────────────────────────────── */
function showHospitalError(msg) {
  const list = document.getElementById('hospitalList');
  if (list) list.innerHTML = `
    <div style="text-align:center;padding:3rem;color:var(--text-light);background:white;border-radius:var(--radius);border:1px solid var(--border)">
      <div style="font-size:3rem;margin-bottom:1rem">⚠️</div>
      <h3>Failed to Load Hospitals</h3>
      <p style="font-size:0.85rem;color:var(--danger);margin-bottom:1rem">${msg}</p>
      <button class="btn btn-primary btn-sm" onclick="fetchHospitals()">🔄 Retry</button>
    </div>`;
}

/* ─── Spinner CSS ────────────────────────────────────────────── */
const hospStyle = document.createElement('style');
hospStyle.textContent = `
  .hosp-spinner {
    width:36px;height:36px;border:3px solid #bfdbfe;
    border-top-color:#1d4ed8;border-radius:50%;
    animation:hosp-spin 0.8s linear infinite;
  }
  @keyframes hosp-spin { to { transform:rotate(360deg); } }
`;
document.head.appendChild(hospStyle);
