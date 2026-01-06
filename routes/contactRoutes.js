const express = require('express');
const router = express.Router();
const ContactMessage = require('../models/ContactMessage');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Send a contact message
// @route   POST /api/contact
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    const contactMessage = new ContactMessage({
      name,
      email,
      subject,
      message
    });

    const createdMessage = await contactMessage.save();

    res.status(201).json(createdMessage);
  } catch (error) {
    res.status(400).json({ message: 'Error sending message', error: error.message });
  }
});

// @desc    Get all contact messages
// @route   GET /api/contact
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const messages = await ContactMessage.find({}).sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// @desc    Mark message as read
// @route   PUT /api/contact/:id/read
// @access  Private/Admin
router.put('/:id/read', protect, admin, async (req, res) => {
  try {
    const message = await ContactMessage.findById(req.params.id);

    if (message) {
      message.read = true;
      const updatedMessage = await message.save();
      res.json(updatedMessage);
    } else {
      res.status(404).json({ message: 'Message not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating message' });
  }
});

// @desc    Delete message
// @route   DELETE /api/contact/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const message = await ContactMessage.findById(req.params.id);

    if (message) {
      await message.deleteOne();
      res.json({ message: 'Message removed' });
    } else {
      res.status(404).json({ message: 'Message not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error deleting message' });
  }
});

module.exports = router;
