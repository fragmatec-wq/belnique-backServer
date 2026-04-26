const SiteContent = require('../models/SiteContent');
const Course = require('../models/Course');
const Artwork = require('../models/Artwork');
const User = require('../models/User');

// @desc    Get content by section
// @route   GET /api/content/:section
// @access  Public
const getContent = async (req, res) => {
  try {
    const { section } = req.params;
    let content = await SiteContent.findOne({ section });
    
    if (!content) {
      // Return default empty structure or null if not found
      // We can also initialize defaults here if we want
      return res.status(404).json({ message: 'Content not found' });
    }

    res.json(content);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all content
// @route   GET /api/content
// @access  Public
const getAllContent = async (req, res) => {
  try {
    const content = await SiteContent.find({});
    // Convert array to object keyed by section for easier frontend consumption
    const contentMap = content.reduce((acc, item) => {
      acc[item.section] = item.content;
      return acc;
    }, {});
    
    // Dynamic Stats Calculation
    try {
      const courseCount = await Course.countDocuments({});
      const artworkCount = await Artwork.countDocuments({}); // Total artworks
      const studentCount = await User.countDocuments({ role: 'student' }); // Total students
 
      contentMap.stats = {
        artists: `${studentCount}+`,
        courses: `${courseCount}+`,
        artworks: `${artworkCount}+`
      };
    } catch (statsError) {
      console.error('Error calculating stats:', statsError);
      // Fallback to existing stats or defaults if calc fails
      if (!contentMap.stats) {
        contentMap.stats = { artists: '0+', courses: '0+', artworks: '0+' };
      }
    }
    
    res.json(contentMap);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update content section
// @route   PUT /api/content/:section
// @access  Private/Admin
const updateContent = async (req, res) => {
  try {
    const { section } = req.params;
    const { content } = req.body;

    let siteContent = await SiteContent.findOne({ section });

    if (siteContent) {
      siteContent.content = content;
      siteContent.lastUpdated = Date.now();
      siteContent.updatedBy = req.user._id;
      await siteContent.save();
    } else {
      siteContent = await SiteContent.create({
        section,
        content,
        updatedBy: req.user._id
      });
    }

    res.json(siteContent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upload image
// @route   POST /api/content/upload
// @access  Private/Admin
const uploadImage = (req, res) => {
  if (req.file) {
    res.json({ url: `/uploads/${req.file.filename}` });
  } else {
    res.status(400).json({ message: 'No file uploaded' });
  }
};

module.exports = {
  getContent,
  getAllContent,
  updateContent,
  uploadImage
};
