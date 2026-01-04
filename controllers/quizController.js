const Quiz = require('../models/Quiz');
const User = require('../models/User');
const QuizResult = require('../models/QuizResult');

// @desc    Get all quizzes
// @route   GET /api/quizzes
// @access  Private
const getQuizzes = async (req, res) => {
  try {
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    
    let query = Quiz.find({}).sort({ createdAt: -1 });
    
    if (!isAdmin) {
      query = query.select('-questions.correctOption');
    }

    const quizzes = await query.lean();

    // Check if user has completed any of the quizzes
    if (!isAdmin) {
        const quizIds = quizzes.map(q => q._id);
        const results = await QuizResult.find({ 
            user: req.user._id, 
            quiz: { $in: quizIds } 
        });

        const completedMap = {};
        results.forEach(r => {
            completedMap[r.quiz.toString()] = {
                score: r.score,
                totalQuestions: r.totalQuestions,
                percentage: r.percentage
            };
        });

        quizzes.forEach(q => {
            if (completedMap[q._id.toString()]) {
                q.completed = true;
                q.result = completedMap[q._id.toString()];
            } else {
                q.completed = false;
            }
        });
    }

    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quizzes', error: error.message });
  }
};

// @desc    Get quiz by ID
// @route   GET /api/quizzes/:id
// @access  Private
const getQuizById = async (req, res) => {
  try {
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    
    let query = Quiz.findById(req.params.id);
    
    if (!isAdmin) {
      query = query.select('-questions.correctOption');
    }

    const quiz = await query;
    if (quiz) {
      res.json(quiz);
    } else {
      res.status(404).json({ message: 'Quiz not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quiz', error: error.message });
  }
};

// @desc    Create a quiz
// @route   POST /api/quizzes
// @access  Private/Admin
const createQuiz = async (req, res) => {
  const { title, description, questions, course } = req.body;

  try {
    const quiz = new Quiz({
      title,
      description,
      questions,
      course,
      createdBy: req.user._id
    });

    const createdQuiz = await quiz.save();
    res.status(201).json(createdQuiz);
  } catch (error) {
    res.status(400).json({ message: 'Error creating quiz', error: error.message });
  }
};

// @desc    Update a quiz
// @route   PUT /api/quizzes/:id
// @access  Private/Admin
const updateQuiz = async (req, res) => {
  const { title, description, questions, course } = req.body;

  try {
    const quiz = await Quiz.findById(req.params.id);

    if (quiz) {
      quiz.title = title || quiz.title;
      quiz.description = description || quiz.description;
      quiz.questions = questions || quiz.questions;
      quiz.course = course || quiz.course;

      const updatedQuiz = await quiz.save();
      res.json(updatedQuiz);
    } else {
      res.status(404).json({ message: 'Quiz not found' });
    }
  } catch (error) {
    res.status(400).json({ message: 'Error updating quiz', error: error.message });
  }
};

// @desc    Delete a quiz
// @route   DELETE /api/quizzes/:id
// @access  Private/Admin
const deleteQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (quiz) {
      await quiz.deleteOne();
      res.json({ message: 'Quiz removed' });
    } else {
      res.status(404).json({ message: 'Quiz not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting quiz', error: error.message });
  }
};

// @desc    Submit quiz answers
// @route   POST /api/quizzes/:id/submit
// @access  Private
const submitQuiz = async (req, res) => {
  const { answers } = req.body; // Array of selected option indices matching questions order
  
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Check if user already submitted this quiz
    const existingResult = await QuizResult.findOne({ user: req.user._id, quiz: req.params.id });
    if (existingResult) {
        return res.status(400).json({ message: 'Você já completou este quiz.' });
    }

    let score = 0;
    const results = quiz.questions.map((question, index) => {
        // If answers is an object/map, access by ID, otherwise assume array order
        const selectedOption = Array.isArray(answers) ? answers[index] : answers[question._id]; 
        
        const isCorrect = question.correctOption === selectedOption;
        if (isCorrect) score++;
        return {
            questionId: question._id,
            questionText: question.text,
            isCorrect,
            correctOption: question.correctOption,
            selectedOption: selectedOption
        };
    });

    const totalQuestions = quiz.questions.length;
    const percentage = (score / totalQuestions) * 100;
    
    // Create quiz result
    const quizResult = await QuizResult.create({
      user: req.user._id,
      quiz: quiz._id,
      score,
      totalQuestions,
      percentage,
      answers: results.map(r => ({
        questionId: r.questionId,
        selectedOption: r.selectedOption,
        isCorrect: r.isCorrect
      })),
      pointsEarned: score // 1 point per correct answer
    });

    // Update user points
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { points: score }
    });

    res.json({
        score,
        totalQuestions,
        percentage,
        results,
        pointsEarned: score
    });

  } catch (error) {
    res.status(500).json({ message: 'Error submitting quiz', error: error.message });
  }
};

module.exports = { getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz, submitQuiz };