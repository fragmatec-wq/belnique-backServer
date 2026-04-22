const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { 
    type: String, 
    required: function() {
      return this.contentType === 'text';
    }
  }, // Stores HTML
  coverImage: { type: String },
  pdfUrl: { type: String },
  videoUrl: { type: String },
  contentType: { type: String, enum: ['text', 'pdf', 'video'], default: 'text' },
  category: { type: String, required: true },
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  likes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  comments: [{
    text: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  views: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'approved' 
  },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Article', articleSchema);
