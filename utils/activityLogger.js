const Activity = require('../models/Activity');

const logActivity = async (data) => {
  try {
    const { user, admin, action, details, targetId } = data;
    await Activity.create({
      user,
      admin,
      action,
      details,
      targetId
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

module.exports = logActivity;
