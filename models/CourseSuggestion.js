const mongoose = require('mongoose');

const courseSuggestionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('CourseSuggestion', courseSuggestionSchema);
