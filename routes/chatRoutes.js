const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const multer = require('multer');
const path = require('path');
const {
  accessConversation,
  fetchConversations,
  sendMessage,
  allMessages,
  markAsRead,
  hideConversation,
  deleteMessage
} = require("../controllers/chatController");

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

router.route("/").post(protect, accessConversation);
router.route("/").get(protect, fetchConversations);
router.route("/message").post(protect, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), sendMessage);
router.route("/message/delete").put(protect, deleteMessage);
router.route("/:conversationId").get(protect, allMessages).delete(protect, hideConversation);
router.route("/read").put(protect, markAsRead);

module.exports = router;
