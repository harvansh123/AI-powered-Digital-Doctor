/* ============================================================
   MEDICINE-SCANNER.JS — AI Medicine Intelligence Scanner v6
   ============================================================
   NEW in v6 (Accurate Medicine Camera Scanner):
     ✔ STEP 1  : Full raw text extraction (detectedText) from OCR
                 Captures: Brand, Generic, Composition, Strength, Manufacturer
     ✔ STEP 2  : Intelligent medicine name identification
                 Priority: known medicine keywords → largest text → first
                 capital phrase → composition keyword match
     ✔ STEP 3  : Chemical formula/composition extraction
                 Detects: Paracetamol 650mg, Amoxicillin + Clavulanic Acid etc.
     ✔ STEP 4  : Supabase SMART DUAL SEARCH
                 Searches medicine_name AND composition column (ILIKE)
                 With multi-tier fuzzy fallbacks
     ✔ STEP 5  : Structured result: Name, Used For, Age Group, Dosage,
                 Side Effects, Precautions + ⚠️ hospital reference notice
     ✔ STEP 6  : Not Found → instant popup + logUnknownMedicine
                 with both detected name AND formula stored
     ✔ STEP 7  : Scan history stores detected_medicine_name + medicine_formula
     ✔ STEP 8  : Camera + Upload behave identically through same OCR pipeline
     ✔ STEP 9  : Async image compression, no UI freeze, duplicate-scan guard
   ============================================================ */

/* ─── Safe Supabase accessor ─────────────────────────────────── */
function getSB() {
  if (typeof supabase !== 'undefined' && supabase && supabase.from) return supabase;
  if (typeof window.supabase !== 'undefined' && window.supabase && window.supabase.from) return window.supabase;
  if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
  return null;
}

/* ─── Module State ───────────────────────────────────────────── */
let scannerStream     = null;
let capturedImageB64  = null;   // compressed base64 (camera or upload)
let currentUserId     = null;   // lazy-loaded
let isAnalyzing       = false;  // duplicate-scan guard

/* ─── Constants ──────────────────────────────────────────────── */
const MAX_FILE_SIZE_MB  = 3;
const ALLOWED_TYPES     = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const COMPRESS_MAX_DIM  = 1280;   // slightly larger for better OCR accuracy
const COMPRESS_QUALITY  = 0.88;   // slightly higher quality → better OCR

/* ─── Known medicine keyword dictionary (for name identification) */
const MEDICINE_KEYWORDS = [
  // Analgesics / Antipyretics
  'paracetamol','acetaminophen','ibuprofen','aspirin','diclofenac','naproxen',
  'mefenamic','tramadol','codeine','morphine','oxycodone','ketorolac',
  // Antibiotics
  'amoxicillin','amoxycillin','clavulanic','ampicillin','azithromycin',
  'ciprofloxacin','levofloxacin','doxycycline','metronidazole','clarithromycin',
  'erythromycin','clindamycin','cefixime','cefpodoxime','ceftriaxone','cephalexin',
  'trimethoprim','sulfamethoxazole','vancomycin','meropenem',
  // Antihistamines
  'cetirizine','loratadine','fexofenadine','diphenhydramine','chlorpheniramine',
  'levocetirizine','desloratadine','hydroxyzine',
  // Antacids / GI
  'omeprazole','pantoprazole','esomeprazole','rabeprazole','ranitidine',
  'famotidine','domperidone','metoclopramide','ondansetron','loperamide',
  'sucralfate','aluminium','magnesium','simethicone',
  // Cardiovascular
  'metoprolol','atenolol','amlodipine','enalapril','lisinopril','ramipril',
  'losartan','valsartan','furosemide','hydrochlorothiazide','spironolactone',
  'digoxin','warfarin','clopidogrel','atorvastatin','rosuvastatin','simvastatin',
  // Diabetes
  'metformin','glibenclamide','glipizide','gliclazide','insulin','sitagliptin',
  'vildagliptin','empagliflozin','dapagliflozin','pioglitazone',
  // Respiratory
  'salbutamol','albuterol','salmeterol','formoterol','budesonide','fluticasone',
  'montelukast','theophylline','ipratropium','tiotropium',
  // Vitamins / Supplements
  'vitamin','ascorbic','thiamine','riboflavin','niacin','pyridoxine','folic',
  'cobalamin','calcium','iron','zinc','magnesium','potassium','sodium',
  // Steroids / Hormones
  'prednisolone','prednisone','dexamethasone','hydrocortisone','methylprednisolone',
  'levothyroxine','thyroxine','insulin','testosterone','estradiol','progesterone',
  // Antifungals / Antivirals
  'fluconazole','ketoconazole','itraconazole','terbinafine','acyclovir',
  'oseltamivir','valacyclovir','tenofovir','lamivudine',
  // Others
  'alprazolam','diazepam','lorazepam','zolpidem','melatonin','gabapentin',
  'pregabalin','carbamazepine','phenytoin','valproate','lithium',
  'chloroquine','hydroxychloroquine','ivermectin','albendazole','mebendazole',
];

/* ─── Composition / strength pattern regex ───────────────────── */
const COMPOSITION_PATTERN = /([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,3})\s*(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|%|ug)/gi;

/* ─── Lazy user-ID fetch ──────────────────────────────────────── */
async function ensureUserId() {
  if (currentUserId) return currentUserId;
  const db = getSB();
  if (!db) return null;
  try {
    const { data: { user } } = await db.auth.getUser();
    currentUserId = user?.id ?? null;
  } catch (_) { /* silent */ }
  return currentUserId;
}

/* ═══════════════════════════════════════════════════════════════
   1. IMAGE COMPRESSION — async, never blocks paint thread
═══════════════════════════════════════════════════════════════ */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;
        if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
          if (width >= height) {
            height = Math.round(height * COMPRESS_MAX_DIM / width);
            width = COMPRESS_MAX_DIM;
          } else {
            width = Math.round(width * COMPRESS_MAX_DIM / height);
            height = COMPRESS_MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', COMPRESS_QUALITY));
      } catch (err) {
        reject(new Error('Image compression failed: ' + err.message));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression.'));
    };

    img.src = url;
  });
}

/* ═══════════════════════════════════════════════════════════════
   2. CAMERA — open / close / capture
═══════════════════════════════════════════════════════════════ */
function openScanner() {
  ensureUserId().then(uid => {
    if (!uid) {
      showToast('🔒 Please sign in to use the Medicine Scanner.', 'warning', 4000);
      setTimeout(() => { window.location.href = 'login.html'; }, 2000);
      return;
    }
    document.getElementById('scannerModal').classList.add('open');
    startCamera();
  });
}

function closeScanner() {
  stopCamera();
  isAnalyzing = false;
  document.getElementById('scannerModal').classList.remove('open');
  document.body.style.overflow = '';
  resetScannerUI();
}

async function startCamera() {
  const video     = document.getElementById('cameraFeed');
  const cameraBox = document.getElementById('cameraBox');
  const captureBox = document.getElementById('captureBox');

  if (cameraBox)   cameraBox.style.display  = 'block';
  if (captureBox)  captureBox.style.display = 'none';
  _el('captureActionWrap', 'none');
  _el('scanResultArea',    'none');
  _el('scanLoadingArea',   'none');
  _el('cameraError',       'none');
  _el('captureBtnWrap',    'none');

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (video) { video.srcObject = scannerStream; video.play(); }
    _el('captureBtnWrap', 'flex');
  } catch (err) {
    console.error('[Scanner] Camera error:', err);
    showCameraError(err);
  }
}

function stopCamera() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  const video = document.getElementById('cameraFeed');
  if (video) video.srcObject = null;
}

/* ─── Capture frame ────────────────────────────────────────── */
function captureFrame() {
  const video  = document.getElementById('cameraFeed');
  const canvas = document.getElementById('captureCanvas');
  if (!video || !canvas) return;

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedImageB64 = canvas.toDataURL('image/jpeg', COMPRESS_QUALITY);

  const preview = document.getElementById('capturedPreview');
  if (preview) preview.src = capturedImageB64;

  document.getElementById('cameraBox').style.display   = 'none';
  document.getElementById('captureBox').style.display  = 'block';
  _el('captureBtnWrap',    'none');
  _el('captureActionWrap', 'flex');

  stopCamera();
  showToast('📸 Image captured! Click "Proceed to Analysis" to continue.', 'success');
}

/* ─── Retake ─────────────────────────────────────────────────── */
function retakePhoto() {
  capturedImageB64 = null;
  isAnalyzing      = false;

  ['cameraHintInput', 'cameraErrorHintInput'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) inp.value = '';
  });

  _el('scanResultArea',  'none');
  _el('scanLoadingArea', 'none');

  const analyzeBtn2 = document.getElementById('analyzeBtn2');
  if (analyzeBtn2) {
    analyzeBtn2.disabled    = false;
    analyzeBtn2.textContent = '🔬 Proceed to Analysis';
    analyzeBtn2.style.opacity = '1';
  }

  startCamera();
}

function resetScannerUI() {
  capturedImageB64 = null;
  isAnalyzing      = false;
  ['captureBox','cameraBox','captureBtnWrap',
   'scanResultArea','scanLoadingArea','cameraError','captureActionWrap'].forEach(id => _el(id, 'none'));
}

function showCameraError(err) {
  const errEl = document.getElementById('cameraError');
  const msgs = {
    NotAllowedError:      'Camera access denied. Please allow camera permission in browser settings.',
    NotFoundError:        'No camera found on this device.',
    NotReadableError:     'Camera is in use by another app. Close it and try again.',
    OverconstrainedError: 'Camera does not support the required settings.',
  };
  const msg = msgs[err.name] || `Camera error: ${err.message}`;
  _el('captureBtnWrap', 'none');
  if (errEl) {
    errEl.style.display = 'flex';
    const msgEl = errEl.querySelector('#cameraErrorMsg');
    if (msgEl) msgEl.textContent = msg;
  }
  const hintInput = document.getElementById('cameraErrorHintInput');
  if (hintInput) hintInput.focus();
}

/* ═══════════════════════════════════════════════════════════════
   3. FILE UPLOAD — async compression, no Chrome freeze
═══════════════════════════════════════════════════════════════ */
async function uploadMedicineImage(input) {
  const file = input?.files?.[0];
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    showScanPopup('❌ Invalid File Type', 'Please upload a JPG, PNG, or WebP image.', 'error');
    input.value = '';
    return;
  }

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    showScanPopup(
      '❌ Image Too Large',
      `Your image is ${sizeMB.toFixed(1)} MB. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
      'error'
    );
    input.value = '';
    return;
  }

    const previewWrap  = document.getElementById('uploadPreviewWrap');
    const proceedBtn   = document.getElementById('uploadProceedBtn');
    const loadingArea  = document.getElementById('uploadLoadingArea');
    const loadText     = document.getElementById('uploadLoadingText');
    const resultArea   = document.getElementById('uploadResultArea');
    const dropZone     = document.getElementById('uploadDropZone');
    const filenameBadge = document.getElementById('uploadFilenameBadge');

    if (previewWrap) previewWrap.style.display = 'none';
    if (dropZone)    dropZone.style.display    = 'block';
    if (resultArea)  { resultArea.style.display = 'none'; resultArea.innerHTML = ''; }
    if (proceedBtn)  { proceedBtn.disabled = true; proceedBtn.style.opacity = '0.5'; proceedBtn.textContent = '⏳ Processing…'; }
    if (loadingArea) { loadingArea.style.display = 'flex'; }
    if (loadText)    { loadText.textContent = 'Compressing image…'; }

    // Yield so the loading indicator renders
    await new Promise(resolve => setTimeout(resolve, 80));

    try {
      const compressed = await compressImage(file);
      capturedImageB64 = compressed;

      if (loadingArea) loadingArea.style.display = 'none';

      const previewImg = document.getElementById('uploadPreviewImg');
      if (previewImg) previewImg.src = compressed;

      // Show filename badge
      if (filenameBadge) filenameBadge.textContent = file.name;

      // Show preview, hide drop zone
      if (previewWrap) previewWrap.style.display = 'block';
      if (dropZone)    dropZone.style.display    = 'none';

      if (proceedBtn) {
        proceedBtn.disabled      = false;
        proceedBtn.style.opacity = '1';
        proceedBtn.textContent   = '🔬 Proceed to Analysis';
      }

      showToast('✅ Image ready! Click "Proceed to Analysis" to continue.', 'success');

    } catch (err) {
      if (loadingArea) loadingArea.style.display = 'none';
      capturedImageB64 = null;
      input.value = '';
      if (dropZone)  dropZone.style.display = 'block';
      if (proceedBtn) { proceedBtn.disabled = true; proceedBtn.style.opacity = '0.5'; proceedBtn.textContent = '🔬 Proceed to Analysis'; }
      showScanPopup('❌ Image Processing Failed', 'Could not process the selected image. Please try another file.', 'error');
      console.error('[Scanner] compressImage error:', err);
    }
}

/* ═══════════════════════════════════════════════════════════════
   4. OCR PIPELINE — STEP 1: Extract FULL raw text (detectedText)
      Returns: { rawText, medicineName, medicineFormula }
═══════════════════════════════════════════════════════════════ */

/**
 * Master OCR function.
 * Returns an object: { rawText, medicineName, medicineFormula }
 * - rawText        : full text extracted from image
 * - medicineName   : intelligently identified medicine name (STEP 2)
 * - medicineFormula: chemical composition / strength detected (STEP 3)
 */
async function performOCR(imageB64) {
  // ── 0. Check typed hint first (fastest, most reliable) ────
  const hintIds = ['cameraHintInput', 'cameraErrorHintInput', 'uploadHintInput', 'medicineHintInput'];
  for (const hid of hintIds) {
    const val = document.getElementById(hid)?.value?.trim();
    if (val && val.length > 1) {
      return {
        rawText:         val,
        medicineName:    identifyMedicineName(val),
        medicineFormula: extractFormula(val),
      };
    }
  }

  let rawText = '';

  // ── 1. Google Vision API ───────────────────────────────────
  const visionKey = window.GOOGLE_VISION_KEY || '';
  if (visionKey) {
    try {
      const base64 = imageB64.replace(/^data:image\/[a-z]+;base64,/, '');
      const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            }],
          }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        rawText = data?.responses?.[0]?.fullTextAnnotation?.text || '';
        console.log('[Scanner] Vision API raw text:', rawText.substring(0, 200));
      }
    } catch (e) {
      console.warn('[Scanner] Vision API error:', e.message);
    }
  }

  // ── 2. Tesseract.js fallback ───────────────────────────────
  if (!rawText && typeof Tesseract !== 'undefined') {
    try {
      const result = await Tesseract.recognize(imageB64, 'eng', { logger: () => {} });
      rawText = result?.data?.text || '';
      console.log('[Scanner] Tesseract raw text:', rawText.substring(0, 200));
    } catch (e) {
      console.warn('[Scanner] Tesseract error:', e.message);
    }
  }

  // ── 3. Parse name + formula from raw text ─────────────────
  if (rawText && rawText.trim()) {
    const medicineName    = identifyMedicineName(rawText);
    const medicineFormula = extractFormula(rawText);
    return { rawText, medicineName, medicineFormula };
  }

  // ── 4. Manual fallback ────────────────────────────────────
  const manualName = await promptUserForMedicineName();
  return {
    rawText:         manualName,
    medicineName:    identifyMedicineName(manualName),
    medicineFormula: extractFormula(manualName),
  };
}

/* ═══════════════════════════════════════════════════════════════
   STEP 2 — Intelligent Medicine Name Identification
   Priority order:
     1. Match against known medicine keyword dictionary
     2. Largest / boldest text lines (longer uppercase tokens)
     3. First properly capitalised phrase (Title Case)
     4. Composition keyword match (fallback)
═══════════════════════════════════════════════════════════════ */
function identifyMedicineName(rawText) {
  if (!rawText || !rawText.trim()) return 'Unknown';

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length >= 3 && /[a-zA-Z]/.test(l));

  if (lines.length === 0) return 'Unknown';

  // ── Priority 1: Known medicine keyword in each line ────────
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of MEDICINE_KEYWORDS) {
      if (lower.includes(kw)) {
        // Extract the full compound name around the keyword
        const compound = extractCompoundName(line, kw);
        if (compound) return cleanMedicineName(compound);
      }
    }
  }

  // ── Priority 2: Largest text (ALL-CAPS or long Title Case) ─
  const boldCandidates = lines.filter(l => {
    const alpha = l.replace(/[^a-zA-Z\s]/g, '').trim();
    return alpha.length >= 4 && (
      l === l.toUpperCase().trim() ||   // ALL CAPS
      /^[A-Z][a-z]+(\s[A-Z][a-z]+)*/.test(l)  // Title Case
    );
  });
  if (boldCandidates.length > 0) {
    // Pick longest one as it's likely the main medicine heading
    const best = boldCandidates.sort((a, b) => b.length - a.length)[0];
    return cleanMedicineName(best);
  }

  // ── Priority 3: First capitalised phrase ───────────────────
  for (const line of lines) {
    if (/^[A-Z]/.test(line)) {
      return cleanMedicineName(line);
    }
  }

  // ── Priority 4: Composition keyword match (last resort) ────
  for (const line of lines) {
    if (COMPOSITION_PATTERN.test(line)) {
      COMPOSITION_PATTERN.lastIndex = 0; // reset regex
      const m = COMPOSITION_PATTERN.exec(line);
      if (m) return cleanMedicineName(m[1]);
    }
  }

  return cleanMedicineName(lines[0]);
}

/**
 * Given a line and a matched keyword, extract the full compound
 * medicine name (e.g. "Amoxicillin + Clavulanic Acid 500mg").
 */
function extractCompoundName(line, keyword) {
  const lower    = line.toLowerCase();
  const kwIdx    = lower.indexOf(keyword);
  if (kwIdx === -1) return null;

  // Take from keyword start to end of line (or 60 chars max)
  const fromKw = line.substring(kwIdx);
  // Trim after dose unit or special characters
  const trimmed = fromKw.replace(/\s*(?:IP|BP|USP|NF|EP)\b.*$/i, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
  return trimmed.length >= 3 ? trimmed : null;
}

function cleanMedicineName(name) {
  return name
    .replace(/[^a-zA-Z0-9\s\-+().]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 120); // truncate safety
}

/* ═══════════════════════════════════════════════════════════════
   STEP 3 — Formula / Composition Extraction
   Examples detected:
     "Paracetamol 650mg"
     "Amoxicillin + Clavulanic Acid 500mg"
     "Ibuprofen 400mg + Paracetamol 325mg"
═══════════════════════════════════════════════════════════════ */
function extractFormula(rawText) {
  if (!rawText) return null;

  const found = [];

  // ── Pattern: Drug Name + Amount + Unit ────────────────────
  const regex = /([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,4})\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|%|ug)\b/gi;
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const comp = `${match[1].trim()} ${match[2]}${match[3]}`;
    if (!found.some(f => f.toLowerCase() === comp.toLowerCase())) {
      found.push(comp);
    }
  }

  if (found.length > 0) {
    // Combine with " + " for multi-component medicines
    return found.join(' + ').substring(0, 200);
  }

  // ── Fallback: Match keyword-adjacent lines ─────────────────
  const lines = rawText.split('\n').map(l => l.trim());
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of MEDICINE_KEYWORDS) {
      if (lower.includes(kw) && /\d/.test(line)) {
        return cleanMedicineName(line).substring(0, 200);
      }
    }
  }

  return null;
}

function promptUserForMedicineName() {
  return new Promise(resolve => {
    const hintInput = document.getElementById('cameraHintInput')
      || document.getElementById('medicineHintInput');

    const errEl = document.getElementById('cameraError');
    if (errEl && errEl.style.display === 'none') {
      errEl.style.display = 'flex';
      const msgEl = errEl.querySelector('#cameraErrorMsg');
      if (msgEl) msgEl.textContent = 'Could not read text from image. Please type the medicine name below:';
    }

    if (hintInput) {
      hintInput.style.display = 'block';
      hintInput.placeholder   = 'Type medicine name and press Enter…';
      hintInput.focus();

      const onEnter = (e) => {
        if (e.key === 'Enter') {
          hintInput.removeEventListener('keydown', onEnter);
          resolve(hintInput.value.trim() || 'Unknown');
        }
      };
      hintInput.addEventListener('keydown', onEnter);
    } else {
      resolve('Unknown');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   STEP 4 — SUPABASE SMART DUAL SEARCH
   Searches BOTH medicine_name AND composition with ILIKE
   Multi-tier fuzzy fallbacks for maximum match rate
═══════════════════════════════════════════════════════════════ */

/**
 * Dual-search: medicine_name OR composition
 * Tier 1: Exact ILIKE match on name
 * Tier 2: Contains match on name
 * Tier 3: Contains match on composition
 * Tier 4: First-word match on either
 * Tier 5: Formula-based composition search
 */
async function searchMedicineInDB(db, medicineName, medicineFormula) {
  const hasName    = medicineName    && medicineName    !== 'Unknown' && medicineName.length >= 2;
  const hasFormula = medicineFormula && medicineFormula !== 'Unknown' && medicineFormula.length >= 3;

  if (!hasName && !hasFormula) return null;

  // ── Tier 1: Exact ILIKE on medicine_name ──────────────────
  if (hasName) {
    const name = medicineName.trim();
    const { data: d1 } = await db.from('medicines').select('*')
      .ilike('medicine_name', name).limit(1);
    if (d1?.length > 0) return d1[0];
  }

  // ── Tier 2: Contains on medicine_name ─────────────────────
  if (hasName) {
    const name = medicineName.trim();
    const { data: d2 } = await db.from('medicines').select('*')
      .ilike('medicine_name', `%${name}%`).limit(1);
    if (d2?.length > 0) return d2[0];
  }

  // ── Tier 3: Contains on composition column ─────────────────
  if (hasName) {
    const name = medicineName.trim();
    const { data: d3 } = await db.from('medicines').select('*')
      .ilike('composition', `%${name}%`).limit(1);
    if (d3?.length > 0) return d3[0];
  }

  // ── Tier 4: Formula search on both columns ─────────────────
  if (hasFormula) {
    // Extract just the drug name part (before the number) from formula
    const formulaDrugName = medicineFormula.replace(/\d+.*$/, '').trim();
    if (formulaDrugName.length >= 3) {
      // Search medicine_name
      const { data: d4a } = await db.from('medicines').select('*')
        .ilike('medicine_name', `%${formulaDrugName}%`).limit(1);
      if (d4a?.length > 0) return d4a[0];

      // Search composition
      const { data: d4b } = await db.from('medicines').select('*')
        .ilike('composition', `%${formulaDrugName}%`).limit(1);
      if (d4b?.length > 0) return d4b[0];
    }
  }

  // ── Tier 5: First-word fallback on medicine_name ───────────
  if (hasName) {
    const firstWord = medicineName.trim().split(/\s+/)[0];
    if (firstWord.length >= 4) {
      const { data: d5 } = await db.from('medicines').select('*')
        .ilike('medicine_name', `%${firstWord}%`).limit(1);
      if (d5?.length > 0) return d5[0];

      // Also try composition column
      const { data: d5b } = await db.from('medicines').select('*')
        .ilike('composition', `%${firstWord}%`).limit(1);
      if (d5b?.length > 0) return d5b[0];
    }
  }

  return null;
}

/* ─── Save to medicine_scan_history (STEP 7) ─────────────────
   Stores: user_id, detected_medicine_name, medicine_formula
─────────────────────────────────────────────────────────────── */
async function saveScanHistory(db, detectedName, detectedFormula) {
  if (!detectedName) return;
  const uid = await ensureUserId();
  if (!uid) return;
  try {
    const payload = {
      user_id:                uid,
      detected_medicine_name: detectedName,
    };
    if (detectedFormula) payload.medicine_formula = detectedFormula;

    const { error } = await db.from('medicine_scan_history').insert(payload);
    if (error) throw error;
    console.log('[Scanner] ✅ Saved to medicine_scan_history:', detectedName, '|', detectedFormula);
  } catch (err) {
    console.error('[Scanner] saveScanHistory error:', err.message);
  }
}

/* ─── Log unknown medicine (STEP 6) ──────────────────────────
   Stores: detected_name, detected_formula, scanned_by_user
─────────────────────────────────────────────────────────────── */
async function logUnknownMedicine(db, detectedName, detectedFormula) {
  try {
    const uid = await ensureUserId();
    const payload = {
      detected_name:    detectedName,
      scanned_by_user:  uid || null,
    };
    if (detectedFormula) payload.detected_formula = detectedFormula;

    await db.from('unknown_medicines').insert(payload);
    console.log('[Scanner] ⚠️ Logged unknown medicine:', detectedName);
  } catch (err) {
    console.error('[Scanner] logUnknownMedicine:', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   5. ANALYSIS ENGINE — MODAL (camera / camera-error hint)
═══════════════════════════════════════════════════════════════ */
async function analyzeMedicine() {
  const hint = document.getElementById('cameraHintInput')?.value?.trim()
    || document.getElementById('cameraErrorHintInput')?.value?.trim();

  if (!capturedImageB64 && !hint) {
    showToast('Please capture an image or type a medicine name first.', 'warning');
    return;
  }
  if (isAnalyzing) { showToast('Analysis already in progress…', 'info'); return; }

  const db = getSB();
  if (!db) { showToast('Database not connected. Please refresh.', 'error'); return; }

  isAnalyzing = true;

  const analyzeBtn2 = document.getElementById('analyzeBtn2');
  const confirmBtn  = document.getElementById('confirmNameBtn');
  if (analyzeBtn2) { analyzeBtn2.disabled = true; analyzeBtn2.textContent = '⏳ Analyzing…'; analyzeBtn2.style.opacity = '0.7'; }
  if (confirmBtn)  { confirmBtn.disabled  = true; }

  _el('scanResultArea',  'none');
  _el('scanLoadingArea', 'flex');
  const scanLoadingText = document.getElementById('scanLoadingText');
  if (scanLoadingText) scanLoadingText.textContent = capturedImageB64
    ? '📖 Reading medicine text from image…'
    : `🔍 Searching for "${hint}"…`;

  try {
    // ── STEP 1-3: OCR + Name + Formula extraction ─────────────
    let medicineName, medicineFormula, rawText;

    if (capturedImageB64) {
      if (scanLoadingText) scanLoadingText.textContent = '📖 Extracting text from medicine label…';
      const ocr = await performOCR(capturedImageB64);
      rawText        = ocr.rawText;
      medicineName   = ocr.medicineName;
      medicineFormula = ocr.medicineFormula;
      console.log('[Scanner] OCR →', { rawText: rawText?.substring(0,100), medicineName, medicineFormula });
    } else {
      // Hint-only path (no image)
      medicineName   = identifyMedicineName(hint);
      medicineFormula = extractFormula(hint);
      rawText        = hint;
    }

    if (scanLoadingText) {
      const displayFormula = medicineFormula ? ` (${medicineFormula.substring(0, 40)})` : '';
      scanLoadingText.textContent = `🔍 Detected: "${medicineName}"${displayFormula} — Searching database…`;
    }

    // ── STEP 4: Dual Supabase search ─────────────────────────
    const medicine = await searchMedicineInDB(db, medicineName, medicineFormula);

    // ── STEP 7: Save scan history regardless ─────────────────
    await saveScanHistory(db, medicineName, medicineFormula);

    // ── Always stop loader ────────────────────────────────────
    _el('scanLoadingArea', 'none');
    _el('scanResultArea',  'block');

    if (medicine) {
      showToast('✅ Medicine found! Results displayed below.', 'success');
      displayMedicineResult(medicine, 'scanResultArea', medicineName, medicineFormula);
    } else {
      // ── STEP 6: Not found handling ────────────────────────
      await logUnknownMedicine(db, medicineName, medicineFormula);
      showScanPopup(
        '⚠️ Medicine Not Found',
        'Medicine information is not yet available in our database.',
        'warning'
      );
      displayNotFoundResult(medicineName, medicineFormula, 'scanResultArea');
    }

  } catch (err) {
    console.error('[Scanner] analyzeMedicine error:', err);
    _el('scanLoadingArea', 'none');
    _el('scanResultArea',  'block');
    const el = document.getElementById('scanResultArea');
    if (el) el.innerHTML = buildErrorCard(err.message, 'retakePhoto', 'closeScanner');
    showToast('Analysis failed. Please try again.', 'error');
  } finally {
    isAnalyzing = false;
    if (analyzeBtn2) { analyzeBtn2.disabled = false; analyzeBtn2.textContent = '🔬 Proceed to Analysis'; analyzeBtn2.style.opacity = '1'; }
    if (confirmBtn)  { confirmBtn.disabled  = false; }
  }
}

/* ─── Search from camera-error hint ─────────────────────────── */
function searchFromCameraError() {
  const errInput  = document.getElementById('cameraErrorHintInput');
  const hintInput = document.getElementById('cameraHintInput');
  if (errInput && hintInput) hintInput.value = errInput.value;
  capturedImageB64 = null;
  analyzeMedicine();
}

/* ═══════════════════════════════════════════════════════════════
   6. ANALYSIS ENGINE — INLINE (file upload)
      Identical behavior to camera scan path (STEP 8)
═══════════════════════════════════════════════════════════════ */
async function analyzeUploadedMedicine() {
  if (!capturedImageB64) {
    showToast('Please upload a medicine image first.', 'warning');
    return;
  }
  if (isAnalyzing) { showToast('Analysis already in progress…', 'info'); return; }

  const db = getSB();
  if (!db) { showToast('Database not connected. Please refresh.', 'error'); return; }

  isAnalyzing = true;

  const proceedBtn  = document.getElementById('uploadProceedBtn');
  const loadingArea = document.getElementById('uploadLoadingArea');
  const loadText    = document.getElementById('uploadLoadingText');
  const resultArea  = document.getElementById('uploadResultArea');

  if (proceedBtn)  { proceedBtn.disabled = true; proceedBtn.textContent = '⏳ Analyzing…'; proceedBtn.style.opacity = '0.7'; }
  if (resultArea)  { resultArea.style.display = 'none'; resultArea.innerHTML = ''; }
  if (loadingArea) { loadingArea.style.display = 'flex'; }
  if (loadText)    { loadText.textContent = '📖 Extracting text from medicine label…'; }

  try {
    // ── STEP 1-3: OCR + Name + Formula (same pipeline as camera) ──
    const ocr = await performOCR(capturedImageB64);
    const { medicineName, medicineFormula } = ocr;
    console.log('[Scanner][Upload] OCR →', { medicineName, medicineFormula });

    if (loadText) {
      const displayFormula = medicineFormula ? ` (${medicineFormula.substring(0, 40)})` : '';
      loadText.textContent = `🔍 Detected: "${medicineName}"${displayFormula} — Searching database…`;
    }

    // ── STEP 4: Dual search ───────────────────────────────────
    const medicine = await searchMedicineInDB(db, medicineName, medicineFormula);

    // ── STEP 7: Save history ──────────────────────────────────
    await saveScanHistory(db, medicineName, medicineFormula);

    // ── Stop loader ───────────────────────────────────────────
    if (loadingArea) loadingArea.style.display = 'none';
    if (resultArea)  resultArea.style.display  = 'block';

    if (medicine) {
      showToast('✅ Medicine found! Scroll down to see the report.', 'success', 4000);
      displayMedicineResult(medicine, 'uploadResultArea', medicineName, medicineFormula);
    } else {
      // ── STEP 6: Not found handling ────────────────────────
      await logUnknownMedicine(db, medicineName, medicineFormula);
      showScanPopup(
        '⚠️ Medicine Not Found',
        'Medicine information is not yet available in our database.',
        'warning'
      );
      displayNotFoundResult(medicineName, medicineFormula, 'uploadResultArea');
    }

  } catch (err) {
    console.error('[Scanner] analyzeUploadedMedicine error:', err);
    if (loadingArea) loadingArea.style.display = 'none';
    if (resultArea) {
      resultArea.style.display = 'block';
      resultArea.innerHTML = buildErrorCard(err.message, 'clearUploadResult', null);
    }
    showToast('Analysis failed. Please check your connection.', 'error');
  } finally {
    isAnalyzing = false;
    if (proceedBtn) { proceedBtn.disabled = false; proceedBtn.textContent = '🔬 Proceed to Analysis'; proceedBtn.style.opacity = '1'; }
  }
}

/* ─── Delete upload preview ───────────────────────────────────────────
   Clears current image so user can start fresh.
───────────────────────────────────────────────────── */
function clearUploadPreview() {
  capturedImageB64 = null;
  isAnalyzing      = false;

  // Reset file input so same file can be re-selected
  const fi = document.getElementById('uploadFileInput');
  if (fi) fi.value = '';

  // Hide preview, restore drop zone
  const previewWrap   = document.getElementById('uploadPreviewWrap');
  const dropZone      = document.getElementById('uploadDropZone');
  const previewImg    = document.getElementById('uploadPreviewImg');
  const filenameBadge = document.getElementById('uploadFilenameBadge');
  const proceedBtn    = document.getElementById('uploadProceedBtn');
  const resultArea    = document.getElementById('uploadResultArea');

  if (previewWrap)   previewWrap.style.display   = 'none';
  if (dropZone)      dropZone.style.display      = 'block';
  if (previewImg)    previewImg.src              = '';
  if (filenameBadge) filenameBadge.textContent   = '';
  if (proceedBtn)  { proceedBtn.disabled = true; proceedBtn.style.opacity = '0.5'; proceedBtn.textContent = '🔬 Proceed to Analysis'; }
  if (resultArea)  { resultArea.style.display = 'none'; resultArea.innerHTML = ''; }

  showToast('🗑️ Image removed. Upload a new image to continue.', 'default', 2500);
}

/* ─── Re-upload (choose different image) ─────────────────────────────
   Clears state and immediately opens the file picker.
───────────────────────────────────────────────────── */
function reUploadImage() {
  // Reset captured state but keep preview visible until new file chosen
  capturedImageB64 = null;
  isAnalyzing      = false;

  const fi = document.getElementById('uploadFileInput');
  if (fi) {
    fi.value = '';       // reset so same file triggers onchange
    fi.click();         // open file picker immediately
  }

  // Clear previous results
  const resultArea = document.getElementById('uploadResultArea');
  if (resultArea) { resultArea.style.display = 'none'; resultArea.innerHTML = ''; }

  // Disable proceed until new image loads
  const proceedBtn = document.getElementById('uploadProceedBtn');
  if (proceedBtn) { proceedBtn.disabled = true; proceedBtn.style.opacity = '0.5'; }
}


/* ═══════════════════════════════════════════════════════════════
   STEP 5 — DISPLAY MEDICINE RESULT
   Shows: Medicine Name, Used For, Age Group, Dosage,
          Side Effects, Precautions, Detected Formula
          ⚠️ Hospital reference notice
═══════════════════════════════════════════════════════════════ */

function displayMedicineResult(med, targetId, detectedName, detectedFormula) {
  const el = document.getElementById(targetId);
  if (!el) return;

  const refId    = 'MED-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const isModal  = (targetId === 'scanResultArea');
  const actionBtns = isModal
    ? `<button class="btn btn-outline btn-sm" onclick="retakePhoto()">📷 Scan Another</button>
       <button class="btn btn-outline btn-sm" onclick="closeScanner()">✕ Close</button>`
    : `<button class="btn btn-outline btn-sm" onclick="clearUploadResult()">🔄 Scan Another</button>`;

  // Show detected formula row only if formula was detected
  const formulaRow = detectedFormula
    ? medRow('🧪 Detected Composition', detectedFormula, true)
    : '';

  el.innerHTML = `
    <div style="animation:fadeInUp 0.4s ease;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;padding:1.25rem 1.5rem;
                  background:linear-gradient(135deg,#1d4ed8,#0ea5e9);color:white">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);
                    display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0">💊</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:1.1rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escS(med.medicine_name)}</div>
          <div style="font-size:0.73rem;opacity:0.85">Intelligence Report · Ref: <strong>${refId}</strong></div>
        </div>
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:99px;
                     font-size:0.72rem;font-weight:700;flex-shrink:0">✅ Found in DB</span>
      </div>

      <!-- Data grid -->
      <div style="background:white">
        ${formulaRow}
        ${medRow('🎯 Used For', med.used_for, true)}
        ${medRowHalf('👥 Suitable Age Group', med.age_group, '💉 Recommended Dosage', med.dosage)}
        ${medRow('⚠️ Side Effects', med.side_effects, true)}
        ${medRow('🛡️ Precautions', med.precautions, true)}
        ${med.composition ? medRow('🧬 Composition', med.composition, true) : ''}
      </div>

      <!-- ⚠️ Hospital notice — STEP 5 requirement -->
      <div style="padding:12px 16px;background:linear-gradient(135deg,#fef3c7,#fde68a);
                  border-top:1px solid #f59e0b;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:1.1rem;flex-shrink:0">⚠️</span>
        <div style="font-size:0.82rem;color:#92400e;font-weight:600;line-height:1.5">
          Show reference number <strong>${refId}</strong> at hospital for verification and doctor consultation.
          This is for informational purposes only — always consult a qualified doctor before taking any medication.
        </div>
      </div>

      <!-- Actions -->
      <div style="padding:1rem 1.25rem;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;background:white">
        <a href="appointment.html" class="btn btn-primary btn-sm">📅 Book Doctor</a>
        ${actionBtns}
      </div>
    </div>`;
}

/** Full-width data row */
function medRow(label, value, fullWidth) {
  if (!value) return '';
  return `
    <div style="${fullWidth ? 'grid-column:1/-1;' : ''}padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:0.7rem;font-weight:700;color:var(--text-light);
                  text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${label}</div>
      <div style="font-size:0.875rem;color:var(--text-dark);line-height:1.5">${escS(value)}</div>
    </div>`;
}

/** Two half-width columns side by side */
function medRowHalf(label1, val1, label2, val2) {
  if (!val1 && !val2) return '';
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
      ${val1 ? `<div style="padding:12px 16px;border-right:1px solid var(--border)">
        <div style="font-size:0.7rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${label1}</div>
        <div style="font-size:0.875rem;color:var(--text-dark);line-height:1.5">${escS(val1)}</div>
      </div>` : '<div></div>'}
      ${val2 ? `<div style="padding:12px 16px">
        <div style="font-size:0.7rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${label2}</div>
        <div style="font-size:0.875rem;color:var(--text-dark);line-height:1.5">${escS(val2)}</div>
      </div>` : '<div></div>'}
    </div>`;
}

/* ─── STEP 6: Not Found result card ─────────────────────────── */
function displayNotFoundResult(name, formula, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const isModal = (targetId === 'scanResultArea');
  const formulaLine = formula
    ? `<p style="font-size:0.82rem;color:var(--text-light);margin-top:4px">
         Detected composition: <strong>${escS(formula)}</strong>
       </p>`
    : '';

  el.innerHTML = `
    <div style="animation:fadeInUp 0.4s ease;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
      <div style="text-align:center;padding:2rem;background:white">
        <div style="font-size:3rem;margin-bottom:1rem">🔍</div>
        <h3 style="font-weight:700;margin-bottom:0.5rem">Medicine Not Found</h3>
        <p style="font-size:0.875rem;color:var(--text-light);margin-bottom:0.25rem">
          <strong>"${escS(name)}"</strong> is not in our database yet.
        </p>
        ${formulaLine}
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;
                    padding:14px 16px;font-size:0.85rem;color:#92400e;margin:1.25rem 0;text-align:left">
          <strong>⚠️ Medicine information is not yet available in our database.</strong><br/>
          Please consult your pharmacist or doctor directly for guidance on this medicine.
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          ${isModal
      ? `<button class="btn btn-primary btn-sm" onclick="retakePhoto()">📷 Try Again</button>
             <button class="btn btn-outline btn-sm" onclick="closeScanner()">✕ Close</button>`
      : `<button class="btn btn-primary btn-sm" onclick="clearUploadResult()">🔄 Try Another</button>`}
          <a href="appointment.html" class="btn btn-outline btn-sm">👨‍⚕️ Consult Doctor</a>
        </div>
      </div>
    </div>`;
}

/* ─── Error card ─────────────────────────────────────────────── */
function buildErrorCard(msg, retakeFn, closeFn) {
  return `
    <div style="text-align:center;padding:2rem;border:1px solid #fecaca;
                border-radius:var(--radius);background:#fef2f2;animation:fadeInUp 0.3s ease">
      <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
      <h4 style="color:#dc2626;margin-bottom:8px">Analysis Failed</h4>
      <p style="font-size:0.85rem;color:#b91c1c;margin-bottom:1rem">${escS(msg)}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${retakeFn ? `<button class="btn btn-primary btn-sm" onclick="${retakeFn}()">🔄 Try Again</button>` : ''}
        ${closeFn  ? `<button class="btn btn-outline btn-sm" onclick="${closeFn}()">✕ Close</button>` : ''}
      </div>
    </div>`;
}

/* ─── Clear upload section ───────────────────────────────────── */
function clearUploadResult() {
  capturedImageB64 = null;
  isAnalyzing      = false;

  ['uploadPreviewWrap', 'uploadLoadingArea'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });

  const resultArea = document.getElementById('uploadResultArea');
  if (resultArea) { resultArea.style.display = 'none'; resultArea.innerHTML = ''; }

  const fileInput = document.querySelector('#moduleScanner input[type="file"]');
  if (fileInput) fileInput.value = '';

  const proceedBtn = document.getElementById('uploadProceedBtn');
  if (proceedBtn) {
    proceedBtn.disabled     = true;
    proceedBtn.textContent  = '🔬 Proceed to Analysis';
    proceedBtn.style.opacity = '0.5';
  }

  ['uploadHintInput', 'cameraHintInput'].forEach(id => {
    const inp = document.getElementById(id);
    if (inp) inp.value = '';
  });
}

/* ═══════════════════════════════════════════════════════════════
   7. MANUAL NAME SEARCH (Search by Medicine Name panel)
═══════════════════════════════════════════════════════════════ */
async function searchMedicineByName() {
  const query = document.getElementById('medicineSearchInput')?.value?.trim();
  if (!query || query.length < 2) {
    showToast('Please enter a medicine name (minimum 2 characters).', 'warning');
    return;
  }

  const db = getSB();
  if (!db) { showToast('Database not connected.', 'error'); return; }

  const btn      = document.getElementById('medicineSearchBtn');
  const resultEl = document.getElementById('medicineSearchResult');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Searching…'; }
  if (resultEl) {
    resultEl.innerHTML = `
      <div style="padding:1.5rem;text-align:center;color:var(--text-light)">
        <div class="spinning-ring" style="margin:0 auto 10px"></div>
        <p style="font-size:0.85rem">Searching Supabase database…</p>
      </div>`;
  }

  try {
    // Identify name + formula from query string
    const medicineName    = identifyMedicineName(query);
    const medicineFormula = extractFormula(query);

    const med = await searchMedicineInDB(db, medicineName || query, medicineFormula);

    if (med) {
      await saveScanHistory(db, med.medicine_name, medicineFormula);
      displayMedicineResultInline(med, medicineFormula);
    } else {
      await logUnknownMedicine(db, query, medicineFormula);
      showScanPopup(
        '⚠️ Medicine Not Found',
        'Medicine information is not yet available in our database.',
        'warning'
      );
      if (resultEl) resultEl.innerHTML = `
        <div style="text-align:center;padding:2rem;border:1px solid var(--border);
                    border-radius:var(--radius);background:white;margin-top:1rem;animation:fadeInUp 0.3s ease">
          <div style="font-size:2.5rem;margin-bottom:0.75rem">🔍</div>
          <h4 style="margin-bottom:0.5rem">Not Found: "${escS(query)}"</h4>
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;
                      padding:12px;font-size:0.82rem;color:#92400e;margin-bottom:1rem">
            ⚠️ <strong>Medicine information is not yet available in our database.</strong><br/>
            Our doctors will update it soon.
          </div>
          <a href="appointment.html" class="btn btn-outline btn-sm">👨‍⚕️ Consult a Doctor</a>
        </div>`;
    }
  } catch (err) {
    console.error('[Scanner] searchMedicineByName error:', err.message);
    if (resultEl) resultEl.innerHTML = '';
    showToast('Search failed. Please check your connection.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔍 Search'; }
  }
}

/* ─── Inline result for manual search ───────────────────────── */
function displayMedicineResultInline(med, detectedFormula) {
  const refId = 'MED-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const el    = document.getElementById('medicineSearchResult');
  if (!el) return;

  const formulaSection = (detectedFormula || med.composition)
    ? `${inlineField('🧪 Detected Composition', detectedFormula || med.composition)}`
    : '';

  el.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;
                margin-top:1rem;animation:fadeInUp 0.3s ease">
      <div style="padding:1rem 1.25rem;background:linear-gradient(135deg,#1d4ed8,#0ea5e9);
                  color:white;display:flex;align-items:center;gap:10px">
        <span style="font-size:1.5rem">💊</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escS(med.medicine_name)}</div>
          <div style="font-size:0.73rem;opacity:0.8">Ref: ${refId}</div>
        </div>
        <span style="margin-left:auto;background:rgba(255,255,255,0.2);padding:3px 10px;
                     border-radius:99px;font-size:0.72rem;font-weight:700;flex-shrink:0">✅ Verified</span>
      </div>
      <div style="padding:1rem;display:flex;flex-direction:column;gap:10px;background:white">
        ${formulaSection}
        ${med.used_for      ? inlineField('🎯 Used For', med.used_for)               : ''}
        ${med.age_group     ? inlineField('👥 Suitable Age Group', med.age_group)    : ''}
        ${med.dosage        ? inlineField('💉 Recommended Dosage', med.dosage)       : ''}
        ${med.side_effects  ? inlineField('⚠️ Side Effects', med.side_effects)      : ''}
        ${med.precautions   ? inlineField('🛡️ Precautions', med.precautions)        : ''}
        <div style="padding:10px 14px;background:#fef3c7;border:1px solid #f59e0b;
                    border-radius:8px;font-size:0.8rem;color:#92400e;font-weight:500">
          ⚠️ Show reference <strong>${refId}</strong> at hospital for verification and doctor consultation.
        </div>
        <a href="appointment.html" class="btn btn-primary btn-sm" style="align-self:flex-start">📅 Book Doctor Appointment</a>
      </div>
    </div>`;
}

function inlineField(label, value) {
  return `
    <div>
      <span style="font-size:0.72rem;font-weight:700;color:var(--text-light);text-transform:uppercase">${label}</span>
      <p style="font-size:0.875rem;margin-top:4px;color:var(--text-dark);line-height:1.5">${escS(value)}</p>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   8. POPUPS & TOASTS
═══════════════════════════════════════════════════════════════ */
function showScanPopup(title, message, type) {
  const old = document.getElementById('scanPopupOverlay');
  if (old) old.remove();

  const colourMap = {
    warning: { bg: '#fef3c7', border: '#f59e0b', icon: '⚠️', titleColor: '#92400e' },
    error:   { bg: '#fef2f2', border: '#fecaca', icon: '❌', titleColor: '#dc2626' },
    success: { bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', titleColor: '#166534' },
  };
  const c = colourMap[type] || colourMap.warning;

  const overlay = document.createElement('div');
  overlay.id = 'scanPopupOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;
    display:flex;align-items:center;justify-content:center;padding:1rem;
    animation:fadeIn 0.2s ease;
  `;
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:2rem;max-width:400px;width:100%;
                box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:slideUpModal 0.25s ease;
                text-align:center">
      <div style="font-size:3rem;margin-bottom:1rem">${c.icon}</div>
      <h3 style="color:${c.titleColor};font-weight:800;margin-bottom:0.75rem">${escS(title)}</h3>
      <p style="font-size:0.9rem;color:#374151;margin-bottom:1.5rem;line-height:1.6">${escS(message)}</p>
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;
                  padding:10px 14px;font-size:0.8rem;color:#92400e;margin-bottom:1.5rem">
        If you need help, please consult a doctor or visit the nearest hospital.
      </div>
      <button onclick="document.getElementById('scanPopupOverlay').remove()"
              class="btn btn-primary" style="width:100%;justify-content:center">
        OK, Got It
      </button>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ─── Helpers ────────────────────────────────────────────────── */
function _el(id, displayVal) {
  const el = document.getElementById(id);
  if (el) el.style.display = displayVal;
}

function escS(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
