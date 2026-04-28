const Article = require('../models/Article');
const SavedItem = require('../models/SavedItem');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');


// Get all articles
exports.getArticles = async (req, res) => {
  try {
    const { status, contentType, page = 1, limit = 10, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (contentType) filter.contentType = contentType;
    if (search) {
        // Search by title or author name (if possible, but author is a ref so complex)
        // For now simple title search
        filter.title = { $regex: search, $options: 'i' };
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const articles = await Article.find(filter)
      .populate('author', 'name profileImage role')
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
      
    res.json(articles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single article by ID
exports.getArticleById = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id)
      .populate('author', 'name profileImage role')
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage');
    
    if (!article) return res.status(404).json({ message: 'Article not found' });
    
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Toggle Save Article
exports.toggleSaveArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const article = await Article.findById(id);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const existingSave = await SavedItem.findOne({ user: userId, article: id });

    if (existingSave) {
      await SavedItem.deleteOne({ _id: existingSave._id });
      res.json({ saved: false });
    } else {
      const newSave = new SavedItem({ user: userId, article: id });
      await newSave.save();
      res.json({ saved: true });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Share Article (Increment share count)
exports.shareArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const article = await Article.findByIdAndUpdate(
      id, 
      { $inc: { shares: 1 } },
      { new: true }
    );
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json({ shares: article.shares });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Saved Articles IDs for a user
exports.getSavedArticleIds = async (req, res) => {
    try {
        const { userId } = req.params;
        const savedItems = await SavedItem.find({ user: userId }).select('article');
        const savedIds = savedItems.map(item => item.article);
        res.json(savedIds);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Like comment
exports.likeComment = async (req, res) => {
  try {
    const { articleId, commentId } = req.params;
    const { userId } = req.body;

    const article = await Article.findById(articleId);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const comment = article.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (!comment.likes) comment.likes = [];

    const index = comment.likes.indexOf(userId);
    if (index === -1) {
      comment.likes.push(userId);
    } else {
      comment.likes.splice(index, 1);
    }

    await article.save();
    res.json(comment.likes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create article
exports.createArticle = async (req, res) => {
  try {
    const { title, content, category, userId, status, isFeatured, contentType, videoUrl: videoUrlBody } = req.body;
    
    let coverImage = '';
    let pdfUrl = '';
    let videoUrl = videoUrlBody || '';

    if (req.files) {
      if (req.files['coverImage']) {
        coverImage = `/uploads/${req.files['coverImage'][0].filename}`;
      }
      if (req.files['pdf']) {
        pdfUrl = `/uploads/${req.files['pdf'][0].filename}`;
      }
      if (req.files['video']) {
        videoUrl = `/uploads/${req.files['video'][0].filename}`;
      }
    }

    const newArticle = new Article({
      title,
      content,
      category,
      coverImage,
      pdfUrl,
      videoUrl,
      contentType: contentType || 'text',
      author: userId,
      status: status || 'approved',
      isFeatured: isFeatured === 'true' || isFeatured === true
    });

    const savedArticle = await newArticle.save();
    const populatedArticle = await Article.findById(savedArticle._id)
      .populate('author', 'name profileImage role')
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage');
    
    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');

    await logActivity({
      user: isRealAdmin ? undefined : userId,
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'ARTICLE_CREATE',
      details: `New article created: ${savedArticle.title}`,
      targetId: savedArticle._id
    });

    res.status(201).json(populatedArticle);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Update article
exports.updateArticle = async (req, res) => {
  try {
    const { title, content, category, status, isFeatured, contentType, videoUrl: videoUrlBody } = req.body;
    const article = await Article.findById(req.params.id);

    if (!article) return res.status(404).json({ message: 'Article not found' });

    if (title) article.title = title;
    if (content) article.content = content;
    if (category) article.category = category;
    if (status) article.status = status;
    if (contentType) article.contentType = contentType;
    if (videoUrlBody) article.videoUrl = videoUrlBody;
    
    if (isFeatured !== undefined) {
      article.isFeatured = isFeatured === 'true' || isFeatured === true;
    }

    if (req.files) {
      if (req.files['coverImage']) {
        article.coverImage = `/uploads/${req.files['coverImage'][0].filename}`;
      }
      if (req.files['pdf']) {
        article.pdfUrl = `/uploads/${req.files['pdf'][0].filename}`;
      }
      if (req.files['video']) {
        article.videoUrl = `/uploads/${req.files['video'][0].filename}`;
      }
    }

    const oldStatus = article.status;
    if (status) article.status = status;

    const updatedArticle = await article.save();
    const populatedArticle = await Article.findById(updatedArticle._id)
      .populate('author', 'name profileImage role')
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage');

    if (status && status !== oldStatus && (status === 'published' || status === 'approved')) {
          const newNotif = await Notification.create({
              user: updatedArticle.author,
              title: 'Artigo Publicado',
              message: `Seu artigo "${updatedArticle.title}" foi aprovado/publicado!`,
              type: 'success',
              relatedId: updatedArticle._id,
              link: '/blog'
          });

          if (req.io) {
            req.io.to(updatedArticle.author.toString()).emit('notification recieved', newNotif);
          }
     }

    await logActivity({
      user: req.user ? req.user._id : null,
      action: 'ARTICLE_UPDATE',
      details: `Article updated: ${updatedArticle.title}`,
      targetId: updatedArticle._id
    });

    res.json(populatedArticle);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Upload inline image (for rich text editor)
exports.uploadInlineImage = (req, res) => {
  if (req.file) {
    res.json({ url: `/uploads/${req.file.filename}` });
  } else {
    res.status(400).json({ message: 'No file uploaded' });
  }
};

// Delete article
exports.deleteArticle = async (req, res) => {
  try {
    // Only allow author or admin (check in frontend or middleware, simplistic here)
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article not found' });
    
    // In a real app, verify req.user._id === article.author or req.user.role === 'admin'
    // Remove associated uploaded files (video, cover image, pdf) if they exist
    const fs = require('fs');
    const path = require('path');

    const tryUnlink = async (urlPath) => {
      try {
        if (!urlPath) return;
        // urlPath may be like '/uploads/filename.ext' or 'uploads/filename.ext' or a remote URL
        if (urlPath.startsWith('http')) return; // skip remote URLs
        const relative = urlPath.replace(/^\//, '');
        const filePath = path.join(__dirname, '..', relative);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (err) {
        // Log and continue
        console.warn('Error deleting file:', urlPath, err.message || err);
      }
    };

    // Delete video file, cover image and pdf if present
    await tryUnlink(article.videoUrl);
    await tryUnlink(article.coverImage);
    await tryUnlink(article.pdfUrl);

    await Article.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user ? req.user._id : null, // Assuming req.user is available via middleware
      action: 'ARTICLE_DELETE',
      details: `Article deleted: ${article.title}`,
      targetId: article._id
    });

    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Like article
exports.likeArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    const { userId } = req.body;

    if (!article) return res.status(404).json({ message: 'Article not found' });

    if (article.likes.includes(userId)) {
      article.likes = article.likes.filter(id => id.toString() !== userId);
    } else {
      article.likes.push(userId);
    }

    await article.save();
    res.json(article.likes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Comment on article
exports.commentArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    const { text, userId } = req.body;

    if (!article) return res.status(404).json({ message: 'Article not found' });

    const newComment = {
      text,
      user: userId,
      createdAt: new Date()
    };

    article.comments.push(newComment);
    await article.save();
    
    const updatedArticle = await Article.findById(req.params.id)
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage');

    res.json(updatedArticle.comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reply to a comment
exports.replyComment = async (req, res) => {
  try {
    const { articleId, commentId } = req.params;
    const { text, userId } = req.body;

    const article = await Article.findById(articleId);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const comment = article.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const newReply = {
      text,
      user: userId,
      createdAt: new Date()
    };

    if (!comment.replies) comment.replies = [];
    comment.replies.push(newReply);

    await article.save();

    const updatedArticle = await Article.findById(articleId)
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage');

    res.json(updatedArticle.comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Like a reply to a comment
exports.likeReply = async (req, res) => {
  try {
    const { articleId, commentId, replyId } = req.params;
    const { userId } = req.body;

    const article = await Article.findById(articleId);
    if (!article) return res.status(404).json({ message: 'Article not found' });

    const comment = article.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = comment.replies ? comment.replies.id(replyId) : null;
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    if (!reply.likes) reply.likes = [];

    const index = reply.likes.indexOf(userId);
    if (index === -1) {
      reply.likes.push(userId);
    } else {
      reply.likes.splice(index, 1);
    }

    await article.save();
    res.json(reply.likes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Increment view
exports.viewArticle = async (req, res) => {
  try {
    const article = await Article.findByIdAndUpdate(
      req.params.id, 
      { $inc: { views: 1 } },
      { new: true }
    );
    res.json({ views: article.views });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
