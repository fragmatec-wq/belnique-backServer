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
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  logoutUser,
  getHomeDetails,
  updateHomeDetails,
  updateHeartbeat,
  getOnlineUsers,
  exportUserData,
  deleteUserProfile,
  adminDeleteUser,
  requestDeletionCode,
  confirmDeletion
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.post('/login', authUser);
router.post('/logout', protect, logoutUser);
router.post('/google-login', authGoogle);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);
router.post('/heartbeat', protect, updateHeartbeat);
router.get('/online', protect, getOnlineUsers);
router.get('/export', protect, exportUserData);
router.post('/request-deletion', protect, requestDeletionCode);
router.post('/confirm-deletion', protect, confirmDeletion);
router.get('/', protect, getUsers);
router.get('/my-courses', protect, getStudentCourses);
router.get('/home-details/:courseId', protect, getHomeDetails);
router.put('/home-details/:courseId', protect, updateHomeDetails);
router.get('/dashboard-stats', protect, getDashboardStats);
router.get('/gallery', protect, getMyGallery);
router.get('/professor/students', protect, getProfessorStudents);
router.get('/professor/schedule', protect, getProfessorSchedule);
router.get('/professor/assessments', protect, getProfessorAssessments);
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)
  .delete(protect, deleteUserProfile);
router.delete('/:id', protect, admin, adminDeleteUser);
router.get('/:id', getUserById);

module.exports = router;
