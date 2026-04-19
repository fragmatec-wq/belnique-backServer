const express = require('express');
const router = express.Router();
const { getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz, submitQuiz } = require('../controllers/quizController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getQuizzes).post(protect, admin, createQuiz);
router.route('/:id').get(protect, getQuizById).put(protect, admin, updateQuiz).delete(protect, admin, deleteQuiz);
router.post('/:id/submit', protect, submitQuiz);

module.exports = router;