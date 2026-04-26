const mongoose = require('mongoose');

const savedItemSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  article: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Article', 
    required: true 
  },
  savedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Compound index to ensure a user can save an article only once
savedItemSchema.index({ user: 1, article: 1 }, { unique: true });

module.exports = mongoose.model('SavedItem', savedItemSchema);
