// controllers/patientLogController.js
const PatientLog = require('../models/PatientLog');



exports.createLog = async (req, res) => {
  try {
    const { title, description, patient } = req.body;

    if (!title || !description || !patient) {
      return res.status(400).json({ error: 'Title, description, and patient ID are required.' });
    }

    const newLog = await PatientLog.create({
      title,
      description,
      patient,
      createdBy: req.user._id
    });

    res.status(201).json({ message: 'Log created successfully', log: newLog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLogsByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const logs = await PatientLog.find({ patient: patientId })
      .populate('createdBy', 'fullname role')
      .sort({ createdAt: -1 });

    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await PatientLog.findById(id);

    if (!log) return res.status(404).json({ error: 'Log not found' });

    if (!log.createdBy.equals(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await PatientLog.findByIdAndDelete(id);
    res.status(200).json({ message: 'Log deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
