const Artwork = require('../models/Artwork');
const Notification = require('../models/Notification');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const logActivity = require('../utils/activityLogger');
const path = require('path');

const fs = require('fs');

// Get all artworks
exports.getArtworks = async (req, res) => {
  try {
    const { type, search } = req.query;
    let query = {};
    
    if (type && type !== 'all') {
      query.type = type;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Admin filtering or public filtering
    if (req.query.approvalStatus) {
        query.approvalStatus = req.query.approvalStatus;
    }

    const artworks = await Artwork.find(query)
      .populate('artist', 'name profileImage')
      .populate('bids.bidder', 'name profileImage')
      .sort({ createdAt: -1 });
    res.json(artworks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create artwork
exports.createArtwork = async (req, res) => {
  try {
    const { title, description, type, price, artistId, isFeatured, approvalStatus, category } = req.body;
    
    // Handle multiple files
    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const newArtwork = new Artwork({
      title,
      description,
      type,
      category: category || 'Outro',
      price: Number(price),
      currentBid: type === 'auction' ? Number(price) : 0,
      artist: artistId,
      images,
      isFeatured: isFeatured === 'true' || isFeatured === true,
      approvalStatus: 'approved' // Automatic approval for everyone
    });

    const savedArtwork = await newArtwork.save();

    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    await logActivity({
      user: isRealAdmin ? undefined : artistId,
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'ARTWORK_CREATE',
      details: `New artwork created: ${savedArtwork.title}`,
      targetId: savedArtwork._id
    });

    res.status(201).json(savedArtwork);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Update artwork
exports.updateArtwork = async (req, res) => {
  try {
    const { title, description, type, price, approvalStatus, isFeatured, category } = req.body;
    const artwork = await Artwork.findById(req.params.id);

    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });

    if (title) artwork.title = title;
    if (description) artwork.description = description;
    if (type) artwork.type = type;
    if (category) artwork.category = category;
    if (price !== undefined) artwork.price = Number(price);
    
    if (approvalStatus) artwork.approvalStatus = approvalStatus;
    
    if (isFeatured !== undefined) {
      artwork.isFeatured = isFeatured === 'true' || isFeatured === true;
    }

    // Handle multiple files
    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    if (images.length > 0) {
       // If logic to replace or append is needed. For now assuming append or replace if logic demands.
       // Current implementation in other parts suggests just setting.
       // However, let's keep original logic or minimal changes.
       // But wait, the original code I read had this logic commented out or missing?
       // Ah, I am editing `updateArtwork` but my read showed logic around line 96-105.
       // Let's stick to adding the notification logic.
    }
    
    if (req.files && req.files.length > 0) {
       const newImages = req.files.map(file => `/uploads/${file.filename}`);
       artwork.images = [...artwork.images, ...newImages];
    }
    
    // Capture old status
    const oldStatus = artwork.approvalStatus;

    if (approvalStatus) artwork.approvalStatus = approvalStatus;

    const updatedArtwork = await artwork.save();
    
    // Check for status change and create notification
    if (approvalStatus && approvalStatus !== oldStatus) {
         if (approvalStatus === 'approved') {
              await Notification.create({
                  user: updatedArtwork.artist,
                  title: 'Obra Aprovada',
                  message: `Sua obra "${updatedArtwork.title}" foi aprovada!`,
                  type: 'success',
                  relatedId: updatedArtwork._id,
                  link: '/galeria'
              });
         } else if (approvalStatus === 'rejected') {
              await Notification.create({
                  user: updatedArtwork.artist,
                  title: 'Obra Rejeitada',
                  message: `Sua obra "${updatedArtwork.title}" foi rejeitada.`,
                  type: 'warning',
                  relatedId: updatedArtwork._id,
                  link: '/galeria'
              });
         }
     }
    
    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    await logActivity({
      user: isRealAdmin ? undefined : (req.user ? req.user._id : null),
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'ARTWORK_UPDATE',
      details: `Artwork updated: ${updatedArtwork.title}`,
      targetId: updatedArtwork._id
    });

    res.json(updatedArtwork);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// View artwork
exports.viewArtwork = async (req, res) => {
  try {
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });
    
    artwork.views += 1;
    await artwork.save();

    if (req.body.userId) {
      await logActivity({
        user: req.body.userId,
        action: 'ARTWORK_VIEW',
        details: `Visualizou a obra: ${artwork.title}`,
        targetId: artwork._id
      });
    }

    res.json({ views: artwork.views });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Like artwork
exports.likeArtwork = async (req, res) => {
  try {
    const { userId } = req.body;
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });
    
    const index = artwork.likes.indexOf(userId);
    if (index === -1) {
      artwork.likes.push(userId);
      // Log Like Activity
      logActivity({
        user: userId,
        action: 'ARTWORK_LIKE',
        details: `Curtiu a obra: ${artwork.title}`,
        targetId: artwork._id
      });
      
      // Add to user favorites
      await User.findByIdAndUpdate(userId, { 
         $addToSet: { favorites: artwork._id } 
      });

    } else {
      artwork.likes.splice(index, 1);
      // Log Unlike Activity? Maybe not needed for history, but user asked for "likes".
      // Let's log unlike too for completeness or just like.
      // User said "quando deixa um like na galeria tambem salva no db".
      
      // Remove from user favorites
      await User.findByIdAndUpdate(userId, { 
         $pull: { favorites: artwork._id } 
      });
    }

    await artwork.save();
    res.json(artwork.likes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Comment artwork
exports.commentArtwork = async (req, res) => {
  try {
    const { text, userId } = req.body;
    const artwork = await Artwork.findById(req.params.id)
      .populate('comments.user', 'name profileImage');
    
    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });

    const newComment = {
      text,
      user: userId,
      createdAt: new Date()
    };

    artwork.comments.push(newComment);
    await artwork.save();
    
    // Re-populate to return full comment data
    const updatedArtwork = await Artwork.findById(req.params.id)
      .populate('comments.user', 'name profileImage');

    res.json(updatedArtwork.comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Place Bid
exports.placeBid = async (req, res) => {
  try {
    const { amount, userId } = req.body;
    const artwork = await Artwork.findById(req.params.id);
    
    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });
    if (artwork.type !== 'auction') return res.status(400).json({ message: 'Not an auction' });
    if (amount <= artwork.currentBid) return res.status(400).json({ message: 'Bid must be higher than current bid' });

    artwork.currentBid = amount;
    artwork.bids.push({ bidder: userId, amount });
    
    await artwork.save();

    await logActivity({
      user: userId,
      action: 'ARTWORK_BID',
      details: `Deu um lance de Kz ${amount} na obra: ${artwork.title}`,
      targetId: artwork._id
    });

    res.json({ currentBid: artwork.currentBid, bids: artwork.bids });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Buy Artwork
exports.buyArtwork = async (req, res) => {
  try {
    const { userId } = req.body;
    const artwork = await Artwork.findById(req.params.id);
    
    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });
    if (artwork.type !== 'sale') return res.status(400).json({ message: 'Not for sale' });
    if (artwork.status === 'sold') return res.status(400).json({ message: 'Already sold' });

    artwork.status = 'sold';
    artwork.winner = userId;
    
    await artwork.save();

    // Add to buyer's owned artworks
    await User.findByIdAndUpdate(userId, { 
        $addToSet: { ownedArtworks: artwork._id } 
    });

    // Get Admin Email
    const settings = await SystemSettings.getInstance();
    const contactEmail = settings.contactEmail || 'admin@belnique.com';

    // Notify Buyer
    await Notification.create({
        user: userId,
        message: `Parabéns! Você adquiriu a obra "${artwork.title}". Por favor, entre em contato através do email ${contactEmail} para coordenar a entrega.`,
        type: 'success',
        relatedId: artwork._id,
        link: '/dashboard/minha-galeria'
    });

    await logActivity({
        user: userId,
        action: 'ARTWORK_PURCHASE',
        details: `Artwork purchased: ${artwork.title}`,
        targetId: artwork._id
    });
    
    res.json({ status: 'sold', artwork });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Accept Bid (Admin or Artist)
exports.acceptBid = async (req, res) => {
  try {
    const { bidId } = req.body;
    const artwork = await Artwork.findById(req.params.id);
    
    if (!artwork) return res.status(404).json({ message: 'Artwork not found' });
    if (artwork.type !== 'auction') return res.status(400).json({ message: 'Not an auction' });
    if (artwork.status === 'sold') return res.status(400).json({ message: 'Already sold' });

    const bid = artwork.bids.id(bidId);
    if (!bid) return res.status(404).json({ message: 'Bid not found' });

    artwork.status = 'sold';
    artwork.winner = bid.bidder;
    artwork.currentBid = bid.amount; // Ensure final price matches winning bid
    artwork.price = bid.amount; // Update price to match accepted bid
    
    await artwork.save();

    // Add to winner's owned artworks
    await User.findByIdAndUpdate(bid.bidder, { 
        $addToSet: { ownedArtworks: artwork._id } 
    });

    // Get Admin Email
    const settings = await SystemSettings.getInstance();
    const contactEmail = settings.contactEmail || 'admin@belnique.com';
    
    // Notify Winner
    await Notification.create({
        user: bid.bidder,
        message: `Parabéns! Seu lance de Kz ${bid.amount.toLocaleString()} foi aceito para a obra "${artwork.title}". Por favor, entre em contato através do email ${contactEmail} para finalizar o pagamento e a entrega.`,
        type: 'success',
        relatedId: artwork._id
    });

    // Notify Losers
    const loserIds = artwork.bids
        .map(b => b.bidder.toString()) // Convert ObjectId to string for comparison
        .filter(id => id !== bid.bidder.toString());
    
    const uniqueLosers = [...new Set(loserIds)];

    if (uniqueLosers.length > 0) {
        const loserNotifications = uniqueLosers.map(userId => ({
            user: userId,
            message: `A obra "${artwork.title}" foi vendida por um valor superior ao seu lance.`,
            type: 'info',
            relatedId: artwork._id
        }));
        await Notification.insertMany(loserNotifications);
    }
    
    // Log activity
    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');

    await logActivity({
      user: isRealAdmin ? undefined : (req.user ? req.user._id : null),
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'AUCTION_END',
      details: `Auction ended for ${artwork.title}. Sold to bid ${bid.amount}`,
      targetId: artwork._id
    });

    res.json({ message: 'Bid accepted', artwork });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteArtwork = async (req, res) => {
  try {
    await Artwork.findByIdAndDelete(req.params.id);
    res.json({ message: 'Artwork deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
