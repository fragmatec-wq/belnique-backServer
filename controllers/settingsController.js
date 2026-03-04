const SystemSettings = require('../models/SystemSettings');

exports.getSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getInstance();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.getInstance();
    
    // Update fields
    Object.keys(req.body).forEach(key => {
      settings[key] = req.body[key];
    });

    const updatedSettings = await settings.save();
    res.json(updatedSettings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.verifyAdminKey = async (req, res) => {
  try {
    const { key } = req.body;
    const settings = await SystemSettings.getInstance();
    
    if (settings.adminRegistrationKey === key) {
      res.json({ valid: true });
    } else {
      res.status(401).json({ valid: false, message: 'Chave inválida' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
