const express = require('express');
const router = express.Router();
const {
  authAdmin,
  registerAdmin,
  getAdminProfile,
  getDashboardStats,
  getAllUsers,
  deleteUser,
  createUser,
  getActivities,
  getUserById, 
  toggleBlockUser,
  resetProfessorPassword,
  uploadHeroImage,
  promoteUser,
  demoteUser,
  testEmailConfig
} = require('../controllers/adminController');
const { protectAdmin } = require('../middleware/adminAuthMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for hero image
const heroStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../../src/assets/');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Always use this filename to overwrite
    cb(null, 'hero-art.jpg');
  }
});

const uploadHero = multer({ storage: heroStorage });

// Configure storage for admin documents
const docStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Unique filename: timestamp-originalName
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadDocs = multer({ 
  storage: docStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDF files are allowed!'), false);
    }
  }
});

router.post('/', uploadDocs.array('documents', 5), registerAdmin);
router.post('/login', authAdmin);
router.get('/profile', protectAdmin, getAdminProfile);
router.get('/stats', protectAdmin, getDashboardStats);
router.get('/users', protectAdmin, getAllUsers);
router.post('/users', protectAdmin, createUser);
router.delete('/users/:id', protectAdmin, deleteUser);
router.get('/users/:id', protectAdmin, getUserById);
router.put('/users/:id/block', protectAdmin, toggleBlockUser);
router.post('/users/:id/reset-password', protectAdmin, resetProfessorPassword);
router.put('/users/:id/promote', protectAdmin, promoteUser);
router.put('/users/:id/demote', protectAdmin, demoteUser);
router.get('/activities', protectAdmin, getActivities);
router.post('/upload-hero', protectAdmin, uploadHero.single('image'), uploadHeroImage);
router.post('/test-email', protectAdmin, testEmailConfig);

module.exports = router;
