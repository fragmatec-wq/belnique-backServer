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
  uploadHeroImage
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

router.post('/', registerAdmin);
router.post('/login', authAdmin);
router.get('/profile', protectAdmin, getAdminProfile);
router.get('/stats', protectAdmin, getDashboardStats);
router.get('/users', protectAdmin, getAllUsers);
router.post('/users', protectAdmin, createUser);
router.delete('/users/:id', protectAdmin, deleteUser);
router.get('/users/:id', protectAdmin, getUserById);
router.put('/users/:id/block', protectAdmin, toggleBlockUser);
router.post('/users/:id/reset-password', protectAdmin, resetProfessorPassword);
router.get('/activities', protectAdmin, getActivities);
router.post('/upload-hero', protectAdmin, uploadHero.single('image'), uploadHeroImage);

module.exports = router;
