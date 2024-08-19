const express = require('express');
const router = express.Router();
const WifiCSI = require('../models/WifiCSI');


router.post('/', async (req, res) => {
  try {
    const newWifiCSI = new WifiCSI({
      user_id: req.body.user_id,
      timestamp: req.body.timestamp,
      csi_data: req.body.csi_data
    });
    await newWifiCSI.save();
    res.status(201).json(newWifiCSI);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const data = await WifiCSI.find();
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
