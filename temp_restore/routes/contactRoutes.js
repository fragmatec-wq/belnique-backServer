const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { 
  createMessage, 
  getMessages, 
  markAsRead, 
  deleteMessage, 
  getUnreadCount 
} = require('../controllers/contactController');

// @desc    Send a contact message
// @route   POST /api/contact
// @access  Public
router.post('/', createMessage);

// @desc    Get all contact messages
// @route   GET /api/contact
// @access  Private/Admin
router.get('/', protect, admin, getMessages);

// @desc    Get unread messages count
// @route   GET /api/contact/unread
// @access  Private/Admin
router.get('/unread', protect, admin, getUnreadCount);

// @desc    Mark message as read
// @route   PUT /api/contact/:id/read
// @access  Private/Admin
router.put('/:id/read', protect, admin, markAsRead);

// @desc    Delete message
// @route   DELETE /api/contact/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteMessage);

module.exports = router;