const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  siteName: { type: String, default: 'Belnique' },
  contactEmail: { type: String, default: '' },
  maintenanceMode: { type: Boolean, default: false },
  allowRegistration: { type: Boolean, default: true },
  defaultUserRole: { type: String, default: 'student' },
  adminRegistrationKey: { type: String, default: 'admin123' },
  superAdminSecurityKey: { type: String, default: 'superadmin123' },
  courseEnrollmentCode: { type: String, default: '' }
}, { timestamps: true });

// Ensure only one settings document exists
systemSettingsSchema.statics.getInstance = async function() {
  const settings = await this.findOne();
  if (settings) return settings;
  return await this.create({});
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
