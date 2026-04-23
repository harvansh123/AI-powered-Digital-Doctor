/* ============================================================
   MAIN.JS — Global JS for AI Digital Doctor
   ============================================================ */

// ─── Navbar scroll effect ───────────────────────────────────
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });
}

// ─── Hamburger menu ─────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

if (hamburger && navLinks) {

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    // Sync mobile actions before opening (always fresh)
    syncMobileActions();
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('open');
  });

  // Mobile dropdown — toggle on tap
  navLinks.querySelectorAll('.nav-dropdown > a').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        e.stopPropagation();
        trigger.closest('.nav-dropdown').classList.toggle('open');
      }
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      navLinks.classList.remove('open');
      hamburger.classList.remove('open');
      navLinks.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
    }
  });
}

// ─── Sync mobile actions (called on menu open + after auth) ────
function syncMobileActions() {
  const links  = document.getElementById('navLinks');
  const actions = document.getElementById('navActions');
  if (!links || !actions) return;
  let mobileDiv = links.querySelector('.nav-mobile-actions');
  if (!mobileDiv) {
    mobileDiv = document.createElement('div');
    mobileDiv.className = 'nav-mobile-actions';
    links.appendChild(mobileDiv);
  }
  mobileDiv.innerHTML = actions.innerHTML;
}

// ─── Auth state ─────────────────────────────────────────────
function updateNavAuth() {
  const user = getUser();
  const navActions = document.getElementById('navActions');
  if (!navActions) return;

  if (user) {
    const firstName = user.first_name || user.firstName || '';
    const lastName  = user.last_name  || user.lastName  || '';
    const initials  = ((firstName[0]||'') + (lastName[0]||'')).toUpperCase() || '👤';

    navActions.innerHTML = `
      <div class="nav-user" id="userMenu" style="box-sizing:border-box;user-select:none;">
        <div class="avatar">${initials}</div>
        <span style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${firstName || 'User'}</span>
        <span style="font-size:0.7rem;flex-shrink:0">▾</span>
      </div>
    `;

    // Add is-logged-in so mobile CSS shows avatar in topbar
    navActions.classList.add('is-logged-in');

    // Create dropdown separately for proper z-index control
    const dropdown = document.createElement('div');
    dropdown.id = 'userDropdown';
    dropdown.style.cssText = `
      display:none;position:fixed;top:var(--nav-height);right:0.75rem;
      background:white;border:1px solid var(--border);
      border-radius:var(--radius);padding:8px;min-width:210px;
      box-shadow:0 12px 40px rgba(0,0,0,0.15);z-index:1100;
      box-sizing:border-box;
    `;
    dropdown.innerHTML = `
      <a href="#" onclick="event.preventDefault();if(typeof openProfilePanel==='function')openProfilePanel();"
        style="display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:0.85rem;
        border-radius:var(--radius-sm);color:var(--text-dark);font-weight:500;transition:background 0.15s"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
        class="dropdown-link">👤 My Profile &amp; Appointments</a>
      <hr style="border:none;border-top:1px solid var(--border);margin:4px 0"/>
      <a href="#" onclick="logout()"
        style="display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:0.85rem;
        border-radius:var(--radius-sm);color:var(--danger);font-weight:500;transition:background 0.15s"
        onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background=''"
        class="dropdown-link">🚪 Logout</a>
    `;
    document.body.appendChild(dropdown);

    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
      userMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
        dropdown.style.display = isHidden ? 'block' : 'none';
      });
    }
    document.addEventListener('click', (e) => {
      if (!navActions.contains(e.target)) dropdown.style.display = 'none';
    });

  } else {
    // Logged out — remove class so Sign In/Sign Up is hidden on mobile (goes to hamburger)
    navActions.classList.remove('is-logged-in');
  }

  // Always sync mobile actions after auth update
  syncMobileActions();
}

// NOTE: getUser() is defined in supabase-client.js — reads from localStorage
// Defining it here as a safe no-op fallback only if supabase-client.js not loaded
if (typeof getUser === 'undefined') {
  window.getUser = function() {
    try { const u = localStorage.getItem('aidoc_user'); return u ? JSON.parse(u) : null; } catch { return null; }
  };
}

function getToken() {
  // Supabase manages tokens internally; this is kept for backward compat
  return localStorage.getItem('aidoc_token');
}

async function logout() {
  // Use Supabase signOut if available, else clear localStorage
  if (typeof supabaseLogout === 'function') {
    await supabaseLogout();
  } else {
    localStorage.removeItem('aidoc_user');
    localStorage.removeItem('aidoc_token');
    showToast('Logged out successfully', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 800);
  }
}

// ─── Toast notifications ─────────────────────────────────────
function showToast(message, type = 'default', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Modal helpers ────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
});

// ─── Password toggle ─────────────────────────────────────────
function togglePassword(inputId, eyeId) {
  const input = document.getElementById(inputId);
  const eye   = document.getElementById(eyeId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (eye) eye.textContent = '🙈';
  } else {
    input.type = 'password';
    if (eye) eye.textContent = '👁️';
  }
}

// ─── Tab switching ────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  const activeBtn = document.querySelector(`.tab-btn[onclick*="${tabName}"]`);
  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');
}

// ─── Google Sign-In placeholder ──────────────────────────────
function googleSignIn() {
  showToast('Google Sign-In — Connect Google OAuth to enable this feature.', 'warning', 4000);
}

// ─── Scroll reveal animation ─────────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.card, .category-card, .abstract-section, .doctor-card, .hospital-card, .donor-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
}

// ─── Inject slideOutRight animation ──────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOutRight {
    to { transform: translateX(110%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// ─── API Note ─────────────────────────────────────────────────
// All data operations use Supabase directly (supabase-client.js).
// The legacy Express backend (localhost:5000) is no longer used.
// apiFetch() is a no-op stub kept for backward compatibility only.
const API_BASE = ''; // unused — Supabase handles all requests
async function apiFetch(endpoint, options = {}) {
  console.warn('[apiFetch] Legacy backend call ignored:', endpoint,
    '— Use supabaseClient directly instead.');
  return null;
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  initScrollReveal();
  // Set min date for appointment date inputs
  const dateInputs = document.querySelectorAll('input[type="date"]');
  const today = new Date().toISOString().split('T')[0];
  dateInputs.forEach(d => {
    if (!d.id.includes('last') && !d.id.includes('Last')) d.min = today;
  });
});
