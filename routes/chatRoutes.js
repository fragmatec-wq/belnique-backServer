const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  accessConversation,
  fetchConversations,
  sendMessage,
  allMessages,
  markAsRead
} = require("../controllers/chatController");

const router = express.Router();

router.route("/").post(protect, accessConversation);
router.route("/").get(protect, fetchConversations);
router.route("/message").post(protect, sendMessage);
router.route("/:conversationId").get(protect, allMessages);
router.route("/read").put(protect, markAsRead);

module.exports = router;
