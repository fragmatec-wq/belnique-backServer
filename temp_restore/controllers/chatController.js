const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// Access or create a 1-on-1 conversation
exports.accessConversation = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    console.log("UserId param not sent with request");
    return res.sendStatus(400);
  }

  try {
    var isChat = await Conversation.find({
      participants: { $all: [req.user._id, userId] }
    })
    .populate("participants", "-password")
    .populate("lastMessage");

    isChat = await User.populate(isChat, {
      path: "lastMessage.author",
      select: "name profileImage email",
    });

    if (isChat.length > 0) {
      res.send(isChat[0]);
    } else {
      var chatData = {
        participants: [req.user._id, userId],
        unreadCounts: {
            [userId]: 0,
            [req.user._id]: 0
        }
      };

      try {
        const createdChat = await Conversation.create(chatData);
        const FullChat = await Conversation.findOne({ _id: createdChat._id }).populate(
          "participants",
          "-password"
        );
        res.status(200).json(FullChat);
      } catch (error) {
        res.status(400);
        throw new Error(error.message);
      }
    }
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

// Fetch all conversations for the user
exports.fetchConversations = async (req, res) => {
  try {
    Conversation.find({ participants: { $elemMatch: { $eq: req.user._id } } })
      .populate("participants", "-password")
      .populate("lastMessage")
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        results = await User.populate(results, {
          path: "lastMessage.author",
          select: "name profileImage email",
        });
        res.status(200).send(results);
      });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  const { content, conversationId } = req.body;

  if (!content || !conversationId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  var newMessage = {
    author: req.user._id,
    content: content,
    conversation: conversationId,
    readBy: [req.user._id]
  };

  try {
    var message = await Message.create(newMessage);
    message = await message.populate("author", "name profileImage");
    message = await message.populate("conversation");
    message = await User.populate(message, {
      path: "conversation.participants",
      select: "name profileImage email",
    });

    // Update conversation with last message and increment unread counts
    const conversation = await Conversation.findById(conversationId);
    const unreadCounts = conversation.unreadCounts || new Map();
    
    // Increment unread count for others
    conversation.participants.forEach(participantId => {
        if (participantId.toString() !== req.user._id.toString()) {
            const currentCount = unreadCounts.get(participantId.toString()) || 0;
            unreadCounts.set(participantId.toString(), currentCount + 1);
        }
    });

    const updatedConversation = await Conversation.findByIdAndUpdate(req.body.conversationId, {
      lastMessage: message,
      lastMessageContent: content,
      lastMessageAt: Date.now(),
      unreadCounts: unreadCounts
    }, { new: true });

    // Manually inject updated conversation into the message object response
    // to ensure socket clients get the fresh unreadCounts
    const messageResponse = message.toObject();
    
    // IMPORTANT: Ensure updatedConversation is populated or at least contains participants array
    // findByIdAndUpdate returns the doc, but participants are ObjectIds.
    // If we want to be safe, we can manually ensure participants are present.
    // However, if we replace messageResponse.conversation (which is populated) with updatedConversation (unpopulated),
    // we lose the populated participants.
    // Ideally, we should merge them or re-populate updatedConversation.
    
    // Better approach: Populate updatedConversation before sending
    const populatedUpdatedConversation = await Conversation.findById(updatedConversation._id)
        .populate("participants", "name profileImage email") // Populate participants for socket broadcasting
        .populate("lastMessage");
        
    messageResponse.conversation = populatedUpdatedConversation;

    res.json(messageResponse);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

// Get all messages for a conversation
exports.allMessages = async (req, res) => {
  try {
    const messages = await Message.find({ conversation: req.params.conversationId })
      .populate("author", "name profileImage email")
      .populate("conversation");
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

// Mark conversation as read
exports.markAsRead = async (req, res) => {
    const { conversationId } = req.body;
    try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
            const unreadCounts = conversation.unreadCounts || new Map();
            unreadCounts.set(req.user._id.toString(), 0);
            await Conversation.findByIdAndUpdate(conversationId, { unreadCounts });
            res.status(200).send("Marked as read");
        } else {
            res.status(404).send("Conversation not found");
        }
    } catch (error) {
        res.status(400).send(error.message);
    }
};
