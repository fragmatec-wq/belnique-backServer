const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Could be Admin too, or system
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: false
  },
  action: {
    type: String,
    required: true,
    enum: [
      'USER_REGISTER', 
      'USER_REGISTER_GOOGLE',
      'LOGIN',
      'LOGIN_GOOGLE',
      'LOGOUT',
      'COURSE_CREATE', 
      'COURSE_UPDATE',
      'COURSE_DELETE', 
      'EVENT_CREATE',
      'EVENT_UPDATE',
      'EVENT_DELETE',
      'EVENT_JOIN',
      'EVENT_LEAVE',
      'ARTICLE_CREATE', 
      'ARTICLE_UPDATE',
      'ARTICLE_DELETE', 
      'ARTWORK_CREATE',
      'ARTWORK_UPDATE',
      'ARTWORK_DELETE',
      'ARTWORK_PURCHASE',
      'ARTWORK_VIEW',
      'ARTWORK_LIKE',
      'ARTWORK_BID',
      'AUCTION_END',
      'USER_DELETE',
      'USER_CREATE_ADMIN',
      'USER_BLOCK',
      'USER_UNBLOCK',
      'PROFESSOR_PASSWORD_RESET',
      'CLASSROOM_CREATE',
      'CLASSROOM_UPDATE',
      'CLASSROOM_DELETE'
    ]
  },
  details: {
    type: String,
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Activity', activitySchema);
