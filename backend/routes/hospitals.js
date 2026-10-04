const express = require('express');
const router  = express.Router();
const { Hospital } = require('../models/Hospital');

// GET /api/get-hospitals
router.get('/get-hospitals', async (req, res) => {
  try {
    const { type, lat, lng, radius } = req.query;
    let hospitals;

    if (lat && lng) {
      // Geospatial query if coordinates provided
      hospitals = await Hospital.find({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
            $maxDistance: (parseInt(radius) || 10) * 1000, // km to meters
          },
        },
        ...(type ? { type } : {}),
      }).limit(20);
    } else {
      hospitals = await Hospital.find(type ? { type } : {}).limit(20);
    }

    // Seed if empty
    if (hospitals.length === 0) {
      const seed = [
        { name:'City General Hospital', address:'12 Healthcare Blvd, Mumbai', type:'Government', phone:'022-2345-6789', beds:450, emergency:true, rating:4.3, specialties:['Cardiology','Emergency'], distance:'1.2 km' },
        { name:'Apollo Hospitals', address:'Plot 251, Vikhroli, Mumbai', type:'Private', phone:'022-6871-1000', beds:680, emergency:true, rating:4.8, specialties:['Cardiac','Orthopedics'], distance:'2.4 km' },
        { name:'Emergency Medical Center', address:'Ring Road Junction, Delhi', type:'Emergency', phone:'011-4200-0000', beds:80, emergency:true, rating:4.2, specialties:['Emergency','Trauma'], distance:'0.8 km' },
      ];
      await Hospital.insertMany(seed);
      hospitals = await Hospital.find(type ? { type } : {});
    }

    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
