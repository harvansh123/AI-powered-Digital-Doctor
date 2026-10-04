const express = require('express');
const router  = express.Router();
const { MedicineRecommendation } = require('../models/Hospital');

// Symptom-Disease knowledge base (server-side)
const DISEASE_DB = [
  { keywords:['headache','fever','body ache','fatigue','sore throat','cough','cold','runny nose','sneezing'], match:3, disease:'Common Cold / Flu', confidence:'High', medicines:[{name:'Paracetamol 500mg',note:'For fever'},{name:'Cetirizine 10mg',note:'For cold symptoms'},{name:'Ambroxol 30mg',note:'Cough expectorant'}], precautions:['Rest and hydrate','Avoid cold drinks','Steam inhalation'], specialist:'General Physician', specialistNote:'Consult if symptoms persist >5 days' },
  { keywords:['chest pain','shortness of breath','palpitation','heart','breathlessness','pressure'], match:2, disease:'Possible Cardiac Issue', confidence:'Urgent', medicines:[{name:'Aspirin 325mg',note:'Emergency only — chew immediately'}], precautions:['⛔ CALL 108 IMMEDIATELY','Rest and loosen clothing','Do not drive'], specialist:'Cardiologist (EMERGENCY)', specialistNote:'Seek emergency care immediately' },
  { keywords:['headache','nausea','migraine','light sensitivity','vomiting','throbbing'], match:2, disease:'Migraine', confidence:'Moderate', medicines:[{name:'Sumatriptan 50mg',note:'Migraine-specific'},{name:'Ibuprofen 400mg',note:'With food'}], precautions:['Rest in dark room','Cold compress','Stay hydrated'], specialist:'Neurologist', specialistNote:'If >4 migraines/month' },
  { keywords:['stomach pain','diarrhea','vomiting','nausea','abdominal','bloating','indigestion'], match:2, disease:'Gastroenteritis', confidence:'High', medicines:[{name:'ORS Sachets',note:'Critical hydration'},{name:'Loperamide 2mg',note:'For diarrhea'},{name:'Domperidone 10mg',note:'For nausea'}], precautions:['ORS hydration','BRAT diet','Avoid dairy'], specialist:'Gastroenterologist', specialistNote:'If symptoms >72 hours' },
  { keywords:['skin rash','itching','hives','allergy','redness','eczema','bumps'], match:2, disease:'Allergic Reaction', confidence:'Moderate', medicines:[{name:'Cetirizine 10mg',note:'Antihistamine'},{name:'Hydrocortisone Cream',note:'Topical use'},{name:'Calamine Lotion',note:'Soothing'}], precautions:['Avoid allergen','Do not scratch','Cool compress'], specialist:'Dermatologist', specialistNote:'For patch testing' },
  { keywords:['joint pain','stiffness','swelling','knee pain','back pain','arthritis'], match:2, disease:'Joint Pain / Arthritis', confidence:'Moderate', medicines:[{name:'Ibuprofen 400mg',note:'With food'},{name:'Diclofenac Gel',note:'Topical'}], precautions:['Hot/cold packs','Gentle exercises','Weight management'], specialist:'Orthopedist', specialistNote:'X-ray recommended' },
];

const DEFAULT_RES = {
  disease:'General Health Advisory', confidence:'Low',
  medicines:[{name:'Paracetamol 500mg',note:'General pain'},{ name:'Vitamin C',note:'Immune support'}],
  precautions:['Rest','Stay hydrated','Monitor symptoms'],
  specialist:'General Physician', specialistNote:'General checkup recommended',
};

// POST /api/symptom-analysis
router.post('/symptom-analysis', async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms || typeof symptoms !== 'string') {
      return res.status(400).json({ success: false, message: 'Symptoms text is required' });
    }

    const text = symptoms.toLowerCase();
    let best = null, bestScore = 0;

    DISEASE_DB.forEach(d => {
      const score = d.keywords.filter(k => text.includes(k)).length;
      if (score >= d.match && score > bestScore) { bestScore = score; best = d; }
    });

    const result = best || DEFAULT_RES;

    // Save to DB if connected
    try {
      await MedicineRecommendation.create({
        symptoms,
        disease: result.disease,
        medicines: result.medicines,
        precautions: result.precautions,
        specialist: result.specialist,
        confidence: result.confidence,
      });
    } catch { /* DB might not be connected */ }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
