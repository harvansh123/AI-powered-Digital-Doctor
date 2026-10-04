/* ============================================================
   AUTH.JS — Supabase Auth (Login + Register)
   No backend required — authenticates directly via Supabase.
   ============================================================ */

// ─── Register Patient ─────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const firstName = document.getElementById('regFirstName')?.value?.trim();
  const lastName  = document.getElementById('regLastName')?.value?.trim();
  const email     = document.getElementById('regEmail')?.value?.trim();
  const phone     = document.getElementById('regPhone')?.value?.trim();
  const password  = document.getElementById('regPassword')?.value;
  const confirm   = document.getElementById('regConfirm')?.value;
  const btn       = document.getElementById('registerBtn');
  const errEl     = document.getElementById('registerError');
  const errMsg    = document.getElementById('registerErrorMsg');

  if (!firstName||!lastName||!email||!phone||!password||!confirm) {
    showErr(errEl, errMsg, 'Please fill all required fields.'); return;
  }
  if (password.length < 8) { showErr(errEl, errMsg, 'Password must be at least 8 characters.'); return; }
  if (password !== confirm) { showErr(errEl, errMsg, 'Passwords do not match.'); return; }

  btn.disabled = true; btn.textContent = '⏳ Creating account...';
  if (errEl) errEl.style.display = 'none';

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, phone, role: 'patient' }
    }
  });

  if (error) {
    showErr(errEl, errMsg, error.message);
    btn.disabled = false; btn.textContent = '🚀 Create Patient Account';
    return;
  }

  // ⚠️ IMPORTANT: Sign out after registration so login page doesn't auto-redirect
  await supabaseClient.auth.signOut();
  localStorage.removeItem('aidoc_user');
  localStorage.removeItem('aidoc_token');

  showToast('Account created! Please sign in with your credentials. 🎉', 'success', 5000);
  setTimeout(() => { window.location.href = 'login.html'; }, 2500);
}

// ─── Register Doctor ──────────────────────────────────────────
async function handleDoctorRegister(e) {
  e.preventDefault();
  const firstName       = document.getElementById('docFirstName')?.value?.trim();
  const lastName        = document.getElementById('docLastName')?.value?.trim();
  const email           = document.getElementById('docEmail')?.value?.trim();
  const phone           = document.getElementById('docPhone')?.value?.trim();
  const specialization  = document.getElementById('docSpec')?.value;
  const experience      = document.getElementById('docExperience')?.value?.trim();
  const consultationFee = document.getElementById('docFee')?.value;
  const hospital        = document.getElementById('docHospital')?.value?.trim();
  const bio             = document.getElementById('docBio')?.value?.trim();
  const password        = document.getElementById('docPassword')?.value;
  const confirm         = document.getElementById('docConfirm')?.value;
  const btn             = document.getElementById('doctorRegBtn');
  const errEl           = document.getElementById('registerError');
  const errMsg          = document.getElementById('registerErrorMsg');

  if (!firstName||!lastName||!email||!phone||!specialization||!password||!confirm) {
    showErr(errEl, errMsg, 'Please fill all required fields.'); return;
  }
  if (password.length < 8) { showErr(errEl, errMsg, 'Password must be at least 8 characters.'); return; }
  if (password !== confirm) { showErr(errEl, errMsg, 'Passwords do not match.'); return; }

  btn.disabled = true; btn.textContent = '⏳ Submitting...';
  if (errEl) errEl.style.display = 'none';

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName, last_name: lastName, phone,
        role: 'doctor', specialization, experience,
        consultation_fee: Number(consultationFee) || 0,
        hospital, bio
      }
    }
  });

  if (error) {
    showErr(errEl, errMsg, error.message);
    btn.disabled = false; btn.textContent = '🏥 Submit for Approval';
    return;
  }

  // ⚠️ Sign out so doctor must wait for admin approval before logging in
  await supabaseClient.auth.signOut();
  localStorage.removeItem('aidoc_user');
  localStorage.removeItem('aidoc_token');

  showToast('Registration submitted! Admin will review your application. ✅', 'success', 5000);
  setTimeout(() => { window.location.href = 'login.html'; }, 2500);
}

// ─── LOGIN ────────────────────────────────────────────────────
// Called from: login.html <form onsubmit="handleLogin(event)">
// Uses Supabase signInWithPassword — zero backend dependency.
async function handleLogin(e) {
  e.preventDefault();

  const email    = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  const btn      = document.getElementById('loginBtn');
  const errEl    = document.getElementById('loginError');
  const errMsg   = document.getElementById('loginErrorMsg');

  if (!email || !password) {
    showLoginError(errEl, errMsg, 'Please enter your email and password.');
    return;
  }

  if (!window.supabaseClient) {
    showLoginError(errEl, errMsg, 'Connection error — Supabase not loaded. Please refresh.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Signing in...';
  if (errEl) errEl.style.display = 'none';

  // ── Step 1: Authenticate ──────────────────────────────────────
  const { data, error } = await window.supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[Login] Auth error:', error.message);
    const msg = (error.message === 'Invalid login credentials')
      ? 'Incorrect email or password. Please try again.'
      : error.message;
    showLoginError(errEl, errMsg, msg);
    btn.disabled = false;
    btn.textContent = '🔐 Sign In';
    return;
  }

  const authUser = data.user;

  // ── Step 2: Fetch profile from Supabase ───────────────────────
  let profile = null;
  try {
    const { data: pd, error: pe } = await window.supabaseClient
      .from('profiles')
      .select('id, first_name, last_name, phone, role, status, avatar_url')
      .eq('id', authUser.id)
      .single();

    if (!pe && pd) profile = pd;
    else console.warn('[Login] Profile fetch error:', pe?.message);
  } catch (ex) {
    console.warn('[Login] Profile exception:', ex);
  }

  // ── Step 3: Fallback — use user_metadata if profile missing ───
  if (!profile) {
    const meta = authUser.user_metadata || {};
    profile = {
      id:         authUser.id,
      first_name: meta.first_name || '',
      last_name:  meta.last_name  || '',
      phone:      meta.phone      || '',
      role:       meta.role       || 'patient',
      status:     'active',
    };
    console.warn('[Login] Using metadata fallback:', profile.role);
  }

  // ── Step 4: Validate selected role matches account role ────────
  const selectedRole = (typeof currentRole !== 'undefined') ? currentRole : 'patient';
  if (profile.role !== selectedRole) {
    await window.supabaseClient.auth.signOut();
    showLoginError(errEl, errMsg,
      `This is a "${profile.role}" account. Go back and select the "${profile.role}" role.`
    );
    btn.disabled = false;
    btn.textContent = '🔐 Sign In';
    return;
  }

  // ── Step 5: Status checks ─────────────────────────────────────
  if (profile.role === 'doctor' && profile.status === 'pending') {
    await window.supabaseClient.auth.signOut();
    showLoginError(errEl, errMsg,
      "Your doctor account is awaiting Admin approval. You'll be notified once approved."
    );
    btn.disabled = false;
    btn.textContent = '🔐 Sign In';
    return;
  }

  if (profile.status === 'blocked') {
    await window.supabaseClient.auth.signOut();
    showLoginError(errEl, errMsg, 'Your account has been blocked. Please contact support.');
    btn.disabled = false;
    btn.textContent = '🔐 Sign In';
    return;
  }

  // ── Step 6: Store session & redirect ──────────────────────────
  const userData = { ...profile, email: authUser.email };
  localStorage.setItem('aidoc_user', JSON.stringify(userData));

  showToast('Welcome back, ' + (profile.first_name || 'User') + '! 👋', 'success');

  const redirectMap = { patient: 'index.html', doctor: 'doctor-dashboard.html', admin: 'admin-dashboard.html' };
  setTimeout(() => {
    window.location.href = redirectMap[profile.role] || 'index.html';
  }, 900);
}

// ─── Helpers ──────────────────────────────────────────────────
function showErr(errEl, errMsg, msg) {
  if (errEl) errEl.style.display = 'flex';
  if (errMsg) errMsg.textContent = msg;
}

function showLoginError(errEl, errMsg, msg) { showErr(errEl, errMsg, msg); }

function togglePassword(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  if (btn) btn.textContent = isHidden ? '🙈' : '👁️';
}

// ─── Password Strength ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('regPassword');
  if (pwInput) pwInput.addEventListener('input', () => updatePasswordStrength(pwInput.value));
});

function updatePasswordStrength(pw) {
  const bar   = document.getElementById('pwStrengthBar');
  const label = document.getElementById('pwStrengthLabel');
  if (!bar || !label) return;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { pct:'0%',   color:'transparent', text:'' },
    { pct:'25%',  color:'#ef4444',     text:'Weak' },
    { pct:'50%',  color:'#f59e0b',     text:'Fair' },
    { pct:'75%',  color:'#3b82f6',     text:'Good' },
    { pct:'100%', color:'#10b981',     text:'Strong' },
  ];
  const l = levels[score];
  bar.style.width    = l.pct;
  bar.style.background = l.color;
  label.textContent  = l.text;
  label.style.color  = l.color;
}

// ─── Session Guard (call on protected dashboard pages) ────────
async function requireAuth(expectedRole) {
  if (!window.supabaseClient) {
    window.location.href = 'login.html'; return null;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html'; return null;
  }

  // Fetch profile; fall back to metadata
  let profile = null;
  try {
    const { data, error } = await window.supabaseClient
      .from('profiles').select('*').eq('id', session.user.id).single();
    if (!error && data) profile = data;
  } catch (_) {}

  if (!profile) {
    const meta = session.user.user_metadata || {};
    profile = {
      id:         session.user.id,
      first_name: meta.first_name || '',
      last_name:  meta.last_name  || '',
      role:       meta.role || 'patient',
      status:     'active',
    };
  }

  if (expectedRole && profile.role !== expectedRole) {
    if (typeof showToast === 'function') {
      showToast('Access denied. ' + expectedRole + ' credentials required.', 'error');
    }
    setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    return null;
  }

  const userData = { ...profile, email: session.user.email };
  localStorage.setItem('aidoc_user', JSON.stringify(userData));
  return userData;
}
