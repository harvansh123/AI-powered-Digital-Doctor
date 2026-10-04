/* ============================================================
   SUPABASE CLIENT — Initialize once, import everywhere
   Project: xlpaiyjwaxhbnospxwjt | Region: ap-south-1
   ============================================================ */

// ─── File:// Origin Guard ─────────────────────────────────────
// Supabase requires an HTTP/HTTPS origin (not file://).
// On Vercel or any HTTP server this block is skipped entirely.
// Only warn when running directly from the filesystem.
(function () {
  if (window.location.protocol === 'file:') {
    console.warn(
      '[AI Digital Doctor] You are opening this page directly from the filesystem (file://).\n' +
      'Supabase auth requires an HTTP origin. Please serve the project via a local server\n' +
      '(e.g. VS Code Live Server) or visit the live Vercel deployment.'
    );
  }
})();

const SUPABASE_URL  = 'https://xlpaiyjwaxhbnospxwjt.supabase.co';
const SUPABASE_ANON = 'sb_publishable_bGJ7Ck2lcLwWvBCUgORqwg_kT0jtkyB';

// Create the global Supabase client
// NOTE: window.supabase is the CDN *library* object (has .createClient).
// We name our *client instance* supabaseClient to avoid redeclaration conflicts.
const supabaseClient = (typeof window.supabase !== 'undefined' && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession : true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Expose globally so all scripts can access it
window.supabaseClient = supabaseClient;

if (!supabaseClient) {
  console.error('[Supabase] Client failed to initialize. Make sure supabase-js CDN is loaded BEFORE this script.');
}

// ─── Auth Helpers ─────────────────────────────────────────────

/** Get current Supabase session (async) */
async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data?.session || null;
}

/** Get full profile from profiles table for current user */
async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) { console.error('[Supabase] getProfile error:', error.message); return null; }
  return { ...data, email: session.user.email };
}

/** Cached profile for this page load (to avoid multiple calls) */
let _cachedProfile = null;
async function getCachedProfile() {
  if (_cachedProfile) return _cachedProfile;
  _cachedProfile = await getCurrentProfile();
  return _cachedProfile;
}

/** Compatibility: sync getUser() reads from localStorage fallback */
function getUser() {
  try {
    const stored = localStorage.getItem('aidoc_user');
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

/** Sign out */
async function supabaseLogout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  localStorage.removeItem('aidoc_user');
  localStorage.removeItem('aidoc_token');
  window.location.href = 'login.html';
}

// ─── Realtime Helpers ─────────────────────────────────────────

/**
 * Subscribe to appointment changes for a specific doctor
 * @param {string} doctorId - UUID of doctor record
 * @param {Function} callback - called with the changed row
 */
function subscribeToAppointments(doctorId, callback) {
  if (!supabaseClient) return null;
  return supabaseClient
    .channel('appointments:doctor:' + doctorId)
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'appointments',
      filter: `doctor_id=eq.${doctorId}`,
    }, (payload) => callback(payload))
    .subscribe();
}

/**
 * Subscribe to notifications for a user
 * @param {string} userId - profile UUID
 * @param {Function} callback
 */
function subscribeToNotifications(userId, callback) {
  if (!supabaseClient) return null;
  return supabaseClient
    .channel('notifications:' + userId)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload) => callback(payload.new))
    .subscribe();
}

// ─── Data Helpers ─────────────────────────────────────────────

/** Generate a human-readable reference ID like APT-X7K2A */
function generateRefId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'APT-';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Insert a notification for a user */
async function sendNotification(userId, title, message, type = 'info', link = null) {
  if (!supabaseClient || !userId) return;
  await supabaseClient.from('notifications').insert({ user_id: userId, title, message, type, link });
}

// ─── Backward-compatibility alias ────────────────────────────
// Other scripts (appointment.js, admin-dashboard.js, doctor-dashboard.js, etc.)
// reference the bare name `supabase`. This alias lets them work without changes.
// NOTE: Do NOT redeclare with `const`/`let` — just assign to window so there's
//       no re-declaration conflict with the CDN library object.
window.supabase = supabaseClient;
