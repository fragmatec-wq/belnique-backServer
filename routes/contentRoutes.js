const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getContent, getAllContent, updateContent, uploadImage } = require('../controllers/contentController');
const { protect, admin } = require('../middleware/authMiddleware');

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

router.get('/', getAllContent);
router.post('/upload', protect, admin, upload.single('image'), uploadImage);
router.get('/:section', getContent);
router.put('/:section', protect, admin, updateContent);

module.exports = router;
