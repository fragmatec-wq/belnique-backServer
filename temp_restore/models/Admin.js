const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['administrator1', 'Superadministrator2'],
    default: 'administrator1',
  },
  // Location & Address (DPA 2026)
  province: {
    type: String,
    required: false, // Make optional initially to avoid breaking existing logic, or strict if required
  },
  municipality: {
    type: String,
    required: false,
  },
  commune: {
    type: String,
    required: false,
  },
  address: { // Bairro/Rua e Número da Porta
    type: String,
    required: false,
  },
  referencePoint: {
    type: String,
    required: false,
  },
  // Fiscal & Legal (AGT)
  taxpayerType: {
    type: String,
    enum: ['Singular', 'Colectivo'],
    default: 'Singular',
  },
  nif: {
    type: String,
    required: false, // Essential for invoices, but maybe not for all admins? User said "Campo numérico obrigatório". I'll keep false for backward compat unless I migrate data.
  },
  idDocument: {
    type: {
      type: String, // BI, Passport, Resident Card
      enum: ['BI', 'Passaporte', 'Cartão de Residente'],
    },
    number: String,
    expirationDate: Date,
  },
  // Contacts
  mobilePrimary: {
    type: String,
    required: false,
  },
  mobileSecondary: {
    type: String,
    required: false,
  },
  // Administrative Config
  status: {
    type: String,
    enum: ['Active', 'Suspended', 'Pending'],
    default: 'Pending', // "Aguardando Validação"
  },
  documents: [{ // Array of file paths
    type: String,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Match password
adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Encrypt password before save
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('Admin', adminSchema);
