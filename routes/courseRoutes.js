const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getCourses, getCourseById, createCourse, updateCourse, deleteCourse, createCourseReview, suggestCourse, getCourseSuggestions, getLatestReviews, getAllReviews, deleteReview, deleteCourseSuggestion, updateCourseSuggestion } = require('../controllers/courseController');
const { protect, admin } = require('../middleware/authMiddleware');

// Multer config for image upload
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `course-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
});

function checkFileType(file, cb) {
  const filetypes = /jpg|jpeg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb('Images only!');
  }
}

router.post('/suggest', suggestCourse);
router.get('/suggestions', protect, admin, getCourseSuggestions);
router.delete('/suggestions/:id', protect, admin, deleteCourseSuggestion);
router.put('/suggestions/:id', protect, admin, updateCourseSuggestion);
router.get('/reviews/latest', getLatestReviews);
router.get('/reviews', getAllReviews);
router.delete('/reviews/:id', protect, admin, deleteReview);
router.route('/').get(getCourses).post(protect, upload.single('image'), createCourse);
router.route('/:id/reviews').post(protect, createCourseReview);
router.route('/:id').get(getCourseById).put(protect, upload.single('image'), updateCourse).delete(protect, deleteCourse);

module.exports = router;
