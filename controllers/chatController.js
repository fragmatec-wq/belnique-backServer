const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

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
    Conversation.find({ 
      participants: { $elemMatch: { $eq: req.user._id } },
      deletedBy: { $ne: req.user._id }
    })
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
  let image = null;
  let audio = null;

  if (req.files) {
    if (req.files.image) {
      image = `/uploads/${req.files.image[0].filename}`;
    }
    if (req.files.audio) {
      audio = `/uploads/${req.files.audio[0].filename}`;
    }
  } else if (req.file) {
      // Fallback for single file upload middleware if used elsewhere or legacy
      if (req.file.mimetype.startsWith('image/')) {
          image = `/uploads/${req.file.filename}`;
      } else if (req.file.mimetype.startsWith('audio/')) {
          audio = `/uploads/${req.file.filename}`;
      }
  }

  if ((!content && !image && !audio) || !conversationId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  var newMessage = {
    author: req.user._id,
    content: content || "",
    image: image,
    audio: audio,
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
      unreadCounts: unreadCounts,
      $pull: { deletedBy: { $in: conversation.participants } } // Revive chat for everyone involved
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
    const conversation = await Conversation.findById(req.params.conversationId);
    
    let filter = { conversation: req.params.conversationId };
    
    // If the user has cleared history, only show messages after that timestamp
    if (conversation && conversation.clearedHistoryAt) {
        const clearedAt = conversation.clearedHistoryAt.get(req.user._id.toString());
        if (clearedAt) {
            filter.createdAt = { $gt: clearedAt };
        }
    }

    // Exclude messages deleted by user or deleted for everyone
    // Logic: 
    // 1. Hide if deletedBy includes req.user._id (I deleted it for myself)
    // 2. Hide if deletedForEveryone is true AND I am the author (I deleted for everyone, so I shouldn't see it)
    // 3. Show if deletedForEveryone is true AND I am NOT the author (I am recipient, should see "Deleted message")
    filter.$and = [
        { deletedBy: { $ne: req.user._id } },
        {
            $or: [
                { deletedForEveryone: { $ne: true } },
                { 
                    deletedForEveryone: true, 
                    author: { $ne: req.user._id }
                }
            ]
        }
    ];

    const messages = await Message.find(filter)
      .populate("author", "name profileImage email")
      .populate("conversation");
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
};

// Hide conversation for the user
exports.hideConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    
    if (!conversation) {
      return res.status(404).send("Conversation not found");
    }

    const clearedHistoryAt = conversation.clearedHistoryAt || new Map();
    clearedHistoryAt.set(req.user._id.toString(), new Date());

    const updatedConversation = await Conversation.findByIdAndUpdate(
      req.params.conversationId,
      { 
        $addToSet: { deletedBy: req.user._id },
        clearedHistoryAt: clearedHistoryAt
      },
      { new: true }
    );
    
    res.status(200).send("Conversation hidden");
  } catch (error) {
    res.status(400).send(error.message);
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

// Delete a message
exports.deleteMessage = async (req, res) => {
    const { messageId, deleteForEveryone } = req.body;
    try {
        const message = await Message.findById(messageId);
        if (!message) return res.status(404).send("Message not found");

        if (deleteForEveryone) {
            // Check if user is author
            if (message.author.toString() !== req.user._id.toString()) {
                return res.status(403).send("Only author can delete for everyone");
            }
            
            // Delete associated files from server to free up space
            if (message.image) {
                const imageName = path.basename(message.image);
                const imagePath = path.join(__dirname, '..', 'uploads', imageName);
                if (fs.existsSync(imagePath)) {
                    try {
                        fs.unlinkSync(imagePath);
                    } catch (err) {
                        console.error("Error deleting image file:", err);
                    }
                }
            }

            if (message.audio) {
                const audioName = path.basename(message.audio);
                const audioPath = path.join(__dirname, '..', 'uploads', audioName);
                if (fs.existsSync(audioPath)) {
                    try {
                        fs.unlinkSync(audioPath);
                    } catch (err) {
                        console.error("Error deleting audio file:", err);
                    }
                }
            }

            message.deletedForEveryone = true;
            message.content = "This message was deleted"; // Optional: clear content
            message.image = null; // Clear reference
            message.audio = null; // Clear reference
        } else {
            // Delete for me
            if (!message.deletedBy.includes(req.user._id)) {
                message.deletedBy.push(req.user._id);
            }
        }
        
        await message.save();
        res.json(message);
    } catch (error) {
        res.status(400).send(error.message);
    }
};
