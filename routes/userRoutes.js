const express = require('express');
const router = express.Router();
const {
  authUser,
  authGoogle,
  registerUser,
  getUserProfile,
  updateUserProfile,
  getDashboardStats,
  getUsers,
  getProfessorStudents,
  getProfessorSchedule,
  getProfessorAssessments,
  getStudentCourses,
  getUserById,
  getMyGallery,
  verifyEmail,
  forgotPassword,
  resetPassword,
  logoutUser
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.post('/login', authUser);
router.post('/logout', protect, logoutUser);
router.post('/google-login', authGoogle);
router.post('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);
router.get('/', protect, getUsers);
router.get('/my-courses', protect, getStudentCourses);
router.get('/dashboard-stats', protect, getDashboardStats);
router.get('/gallery', protect, getMyGallery);
router.get('/professor/students', protect, getProfessorStudents);
router.get('/professor/schedule', protect, getProfessorSchedule);
router.get('/professor/assessments', protect, getProfessorAssessments);
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);
router.get('/:id', protect, getUserById);

module.exports = router;
