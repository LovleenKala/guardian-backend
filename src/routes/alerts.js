const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');

router.post('/', async (req, res) => {
  try {
    const newAlert = new Alert({
      user_id: req.body.user_id,
      alert_type: req.body.alert_type,
      message: req.body.message
    });
    await newAlert.save();
    res.status(201).json(newAlert);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


router.get('/', async (req, res) => {
  try {
    const alerts = await Alert.find();
    res.status(200).json(alerts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;