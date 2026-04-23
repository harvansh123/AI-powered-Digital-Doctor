/* ============================================================
   MEDICINE.JS — AI Symptom Analysis & Medicine Recommendation
   Data Source: Supabase → disease_symptoms table
   ============================================================ */

// ─── In-memory cache (loaded once on page load) ───────────────
let DISEASE_DB = [];       // populated from Supabase
let dbLoaded   = false;    // guard to prevent duplicate fetches
let dbLoading  = false;    // lock while fetching

// ─── Fetch disease database from Supabase ────────────────────
async function fetchDiseasesFromSupabase() {
  if (dbLoaded)   return DISEASE_DB;   // cache hit
  if (dbLoading)  {
    // wait for the in-flight request
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (!dbLoading) { clearInterval(interval); resolve(); }
      }, 100);
    });
    return DISEASE_DB;
  }

  dbLoading = true;

  try {
    const db = window.supabaseClient || window.supabase;
    if (!db) throw new Error('Supabase client not initialized');

    const { data, error } = await db
      .from('disease_symptoms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Normalize Supabase rows → same shape the old DISEASE_DB used
    DISEASE_DB = (data || []).map(row => ({
      disease:          row.disease,
      desc:             row.description,
      primaryKeywords:  row.primary_keywords  || [],
      keywords:         row.keywords          || [],
      match:            row.match_threshold   || 2,
      confidence:       row.confidence        || 'Moderate',
      confidenceClass:  row.confidence_class  || 'badge-warning',
      medicines:        Array.isArray(row.medicines)   ? row.medicines   : [],
      precautions:      Array.isArray(row.precautions) ? row.precautions : [],
      specialist:       row.specialist        || 'General Physician',
      specialistNote:   row.specialist_note   || '',
    }));

    dbLoaded  = true;
    dbLoading = false;
    console.log(`[MedDB] Loaded ${DISEASE_DB.length} diseases from Supabase ✓`);
    return DISEASE_DB;

  } catch (err) {
    dbLoading = false;
    console.error('[MedDB] Supabase fetch failed:', err);
    return null;   // caller handles null
  }
}

// ─── Default fallback response ────────────────────────────────
const DEFAULT_RESPONSE = {
  disease:         'General Health Advisory',
  desc:            'Based on the provided symptoms, no specific condition could be precisely identified. Please provide more detailed symptoms for a better analysis.',
  confidence:      'Low',
  confidenceClass: 'badge-warning',
  medicines: [
    { name: 'Paracetamol (500mg)',  note: 'For general pain or fever' },
    { name: 'Vitamin C (500mg)',    note: 'Immune support' },
    { name: 'ORS Sachets',         note: 'Stay hydrated' },
  ],
  precautions: [
    'Rest and stay well hydrated',
    'Monitor symptoms closely for 24–48 hours',
    'Avoid self-medication beyond basic OTC drugs',
    'Seek professional medical help if symptoms worsen',
    'Maintain a healthy balanced diet',
  ],
  specialist:     'General Physician',
  specialistNote: 'A general checkup is recommended',
};

// ─── Voice Recognition ────────────────────────────────────────
let recognition = null;
let isListening  = false;

function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.lang = 'en-US';
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.continuous = false;

  r.onstart = () => {
    isListening = true;
    const btn = document.getElementById('voiceBtn');
    const status = document.getElementById('voiceStatus');
    if (btn)    { btn.classList.add('listening'); btn.textContent = '⏹'; }
    if (status) status.style.display = 'block';
  };

  r.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    const input           = document.getElementById('symptomInput');
    const voiceTranscript = document.getElementById('voiceTranscript');
    if (input)           input.value = transcript;
    if (voiceTranscript) voiceTranscript.textContent = transcript;
  };

  r.onend = () => {
    isListening = false;
    const btn    = document.getElementById('voiceBtn');
    const status = document.getElementById('voiceStatus');
    if (btn) { btn.classList.remove('listening'); btn.textContent = '🎤'; }
    if (status) { setTimeout(() => { status.style.display = 'none'; }, 2000); }
  };

  r.onerror = (e) => {
    isListening = false;
    const btn = document.getElementById('voiceBtn');
    if (btn) { btn.classList.remove('listening'); btn.textContent = '🎤'; }
    const msgs = {
      'not-allowed': 'Microphone access denied. Please enable it in browser settings.',
      'no-speech':   'No speech detected. Please try again.',
      'network':     'Network error. Check your connection.',
    };
    showToast(msgs[e.error] || 'Voice recognition error. Try again.', 'error');
  };

  return r;
}

function toggleVoice() {
  if (!recognition) recognition = initVoice();
  if (!recognition) {
    showToast('Voice input not supported in this browser. Please use Chrome.', 'warning');
    return;
  }
  if (isListening) { recognition.stop(); } else { recognition.start(); }
}

// ─── Quick Symptom Add ────────────────────────────────────────
function addSymptom(symptom) {
  const input = document.getElementById('symptomInput');
  if (!input) return;
  const current = input.value.trim();
  input.value = current ? `${current}, ${symptom}` : symptom;
  input.focus();
}

// ─── AI Analysis Engine ───────────────────────────────────────
async function analyzeSymptoms() {
  const input = document.getElementById('symptomInput');
  if (!input || !input.value.trim()) {
    showToast('Please enter or speak your symptoms first', 'warning');
    input?.focus();
    return;
  }

  const symptoms = input.value.toLowerCase();

  // Show loading
  document.getElementById('emptyState').style.display   = 'none';
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('resultCard').style.display   = 'none';

  // ----------------------------------------------------------
  // Ensure disease DB is loaded from Supabase
  // ----------------------------------------------------------
  if (!dbLoaded) {
    const result = await fetchDiseasesFromSupabase();
    if (result === null) {
      // Supabase unavailable
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('emptyState').style.display   = 'block';
      showToast('⚠️ Medical database temporarily unavailable. Please try again shortly.', 'error');
      return;
    }
  }

  // Simulate a brief processing delay for UX realism
  setTimeout(() => {
    const result = matchDisease(symptoms);
    displayResults(result);

    // Try backend if available (non-blocking)
    tryBackendAnalysis(input.value.trim(), result);

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('resultCard').style.display   = 'block';

    showToast('Analysis complete!', 'success');

    // Smooth scroll to results on mobile
    if (window.innerWidth <= 768) {
      document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 2200);
}

// ─── Matching Algorithm ───────────────────────────────────────
// Scoring: primary keyword match = 3 pts, general keyword = 1 pt
// Normalized by max possible weight to prevent large lists dominating
function matchDisease(symptomText) {
  let bestMatch = null;
  let bestScore = -1;

  DISEASE_DB.forEach(disease => {
    const generalMatches = disease.keywords.filter(kw => symptomText.includes(kw)).length;
    const primaryMatches = (disease.primaryKeywords || []).filter(kw => symptomText.includes(kw)).length;
    const rawScore       = generalMatches + (primaryMatches * 3);

    if (generalMatches < disease.match) return;   // below threshold

    const maxPossible     = disease.keywords.length + ((disease.primaryKeywords || []).length * 3);
    const normalizedScore = rawScore / maxPossible;

    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestMatch = disease;
    }
  });

  return bestMatch || DEFAULT_RESPONSE;
}

// ─── Optional backend fallback ────────────────────────────────
async function tryBackendAnalysis(symptoms, fallbackResult) {
  try {
    const data = await apiFetch('/symptom-analysis', {
      method: 'POST',
      body: JSON.stringify({ symptoms }),
    });
    if (data && data.disease) displayResults(data);
  } catch {
    // Backend not running — client-side result already displayed
  }
}

// ─── Render Results ───────────────────────────────────────────
function displayResults(result) {
  document.getElementById('diseaseName').textContent = result.disease || '—';
  document.getElementById('diseaseDesc').textContent = result.desc    || '—';

  const badge = document.getElementById('confidenceBadge');
  if (badge) {
    badge.textContent = result.confidence || 'Analyzed';
    badge.className   = `badge ${result.confidenceClass || 'badge-primary'}`;
  }

  const medList = document.getElementById('medicineList');
  if (medList && result.medicines) {
    medList.innerHTML = result.medicines.map(m => `
      <div class="medicine-tag" title="${m.note}">
        💊 ${m.name}
        <span style="font-size:0.72rem;opacity:0.8;margin-left:4px">• ${m.note}</span>
      </div>
    `).join('');
  }

  const precList = document.getElementById('precautionList');
  if (precList && result.precautions) {
    precList.innerHTML = result.precautions.map(p => `
      <li style="color:${p.startsWith('⛔') || p.startsWith('⚠️') ? '#dc2626' : 'var(--text-medium)'}">${p}</li>
    `).join('');
  }

  document.getElementById('specialistName').textContent = result.specialist     || '—';
  document.getElementById('specialistNote').textContent = result.specialistNote || '—';
}

// ─── Clear ────────────────────────────────────────────────────
function clearResults() {
  document.getElementById('symptomInput').value       = '';
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('symptomInput').focus();
}

// ─── Pre-load on page load (non-blocking) ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchDiseasesFromSupabase().then(data => {
    if (data === null) {
      console.warn('[MedDB] Could not pre-load disease database from Supabase.');
    }
  });
});
