const Course = require('../models/Course');
const Review = require('../models/Review');
const CourseSuggestion = require('../models/CourseSuggestion');
const logActivity = require('../utils/activityLogger');
const fs = require('fs');
const path = require('path');


// @desc    Get all courses
// @route   GET /api/courses
// @access  Public
const getCourses = async (req, res) => {
  try {
    const courses = await Course.find({}, null, { maxTimeMS: 5000 })
      .populate('instructor', 'name')
      .lean();
    res.json(courses || []);
  } catch (err) {
    console.error('getCourses error:', err.message || err);
    // Return a fast failure so proxies don't time out (avoid 503 by long waits)
    res.status(500).json({ message: 'Erro ao carregar cursos' });
  }
};
 
// @desc    Get course by ID
// @route   GET /api/courses/:id
// @access  Public
const getCourseById = async (req, res) => {
  const course = await Course.findById(req.params.id).populate('instructor', 'name');
  if (course) {
    const reviews = await Review.find({ course: req.params.id });
    res.json({ ...course.toObject(), reviews });
  } else {
    res.status(404).json({ message: 'Course not found' });
  }
};

// @desc    Create a course
// @route   POST /api/courses
// @access  Private/Professor/Admin
const createCourse = async (req, res) => {
  const { title, description, price, category, level, duration, isFeatured, type, targetAudience } = req.body;
  
  let locations = [];
  if (req.body.locations) {
      try {
          locations = JSON.parse(req.body.locations);
      } catch (e) {
          locations = [req.body.locations];
      }
  }

  const thumbnail = req.file ? `/uploads/${req.file.filename}` : undefined;

  const course = new Course({
    title,
    description,
    price: Number(price),
    category,
    level,
    duration,
    isFeatured: isFeatured === 'true',
    instructor: req.user._id,
    thumbnail,
    type: type || 'normal',
    locations: type === 'home' ? locations : [],
    targetAudience: targetAudience || 'all'
  });
  const createdCourse = await course.save();

  const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
  await logActivity({
    user: isRealAdmin ? undefined : req.user._id,
    admin: isRealAdmin ? req.user._id : undefined,
    action: 'COURSE_CREATE',
    details: `New course created: ${createdCourse.title}`,
    targetId: createdCourse._id
  });

  res.status(201).json(createdCourse);
};

// @desc    Update a course
// @route   PUT /api/courses/:id
// @access  Private/Professor/Admin
const updateCourse = async (req, res) => {
  const { title, description, price, category, level, duration, isFeatured, type, targetAudience } = req.body;
  const course = await Course.findById(req.params.id);

  if (course) {
    course.title = title || course.title;
    course.description = description || course.description;
    course.price = price !== undefined ? Number(price) : course.price;
    course.category = category || course.category;
    course.level = level || course.level;
    course.duration = duration || course.duration;
    
    if (type) course.type = type;
    if (targetAudience) course.targetAudience = targetAudience;
    
    if (req.body.locations) {
        try {
            course.locations = JSON.parse(req.body.locations);
        } catch (e) {
            course.locations = [req.body.locations];
        }
    } else if (type === 'normal') {
        course.locations = [];
    }

    if (isFeatured !== undefined) {
      // Handle boolean conversion if sent as string from form data
      course.isFeatured = isFeatured === 'true' || isFeatured === true;
    }

    if (req.file) {
      course.thumbnail = `/uploads/${req.file.filename}`;
    }

    const updatedCourse = await course.save();

    const isRealAdmin = req.user && (req.user.role === 'administrator1' || req.user.role === 'Superadministrator2');
    await logActivity({
      user: isRealAdmin ? undefined : req.user._id,
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'COURSE_UPDATE',
      details: `Course updated: ${updatedCourse.title}`,
      targetId: updatedCourse._id
    });

    res.json(updatedCourse);
  } else {
    res.status(404).json({ message: 'Course not found' });
  }
};

// @desc    Get latest reviews
// @route   GET /api/courses/reviews/latest
// @access  Public
const getLatestReviews = async (req, res) => {
  try {
    const reviews = await Review.find({})
      .sort({ createdAt: -1 })
      .populate({
        path: 'user',
        match: { role: 'student' },
        select: 'name role profileImage'
      })
      .populate('course', 'title');

    // Filter out reviews where user match failed (null) and take top 3
    const studentReviews = reviews
      .filter(review => review.user !== null)
      .slice(0, 3);

    res.json(studentReviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all reviews
// @route   GET /api/courses/reviews
// @access  Public
const getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find({})
      .sort({ createdAt: -1 })
      .populate({
        path: 'user',
        select: 'name role profileImage gender'
      })
      .populate('course', 'title');

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new review
// @route   POST /api/courses/:id/reviews
// @access  Private
const createCourseReview = async (req, res) => {
  const { rating, comment } = req.body;
  const course = await Course.findById(req.params.id);

  if (course) {
    const alreadyReviewed = await Review.findOne({
      user: req.user._id,
      course: req.params.id,
    });

    if (alreadyReviewed) {
      return res.status(400).json({ message: 'Course already reviewed' });
    }

    const review = new Review({
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
      course: req.params.id,
    });

    await review.save();

    const reviews = await Review.find({ course: req.params.id });
    course.numReviews = reviews.length;
    course.rating =
      reviews.reduce((acc, item) => item.rating + acc, 0) / reviews.length;

    await course.save();
    res.status(201).json({ message: 'Review added' });
  } else {
    res.status(404).json({ message: 'Course not found' });
  }
};

// @desc    Delete a course
// @route   DELETE /api/courses/:id
// @access  Private/Professor/Admin
const deleteCourse = async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (course) {
    // Remove thumbnail file if present
    try {
      if (course.thumbnail && !course.thumbnail.startsWith('http')) {
        const relative = course.thumbnail.replace(/^\//, '');
        const filePath = path.join(__dirname, '..', relative);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      }
    } catch (err) {
      console.warn('Failed to delete course thumbnail:', err.message || err);
    }

    // Check if user is instructor or admin (simplified for now)
    await course.deleteOne();

    const isRealAdmin = req.user.role === 'administrator1' || req.user.role === 'Superadministrator2';

    await logActivity({
      user: isRealAdmin ? undefined : req.user._id,
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'COURSE_DELETE',
      details: `Course deleted: ${course.title}`,
      targetId: course._id
    });

    res.json({ message: 'Course removed' });
  } else {
    res.status(404).json({ message: 'Course not found' });
  }
};

// @desc    Suggest a course
// @route   POST /api/courses/suggest
// @access  Public
const suggestCourse = async (req, res) => {
  const { name, email, title, description, category } = req.body;

  try {
    const suggestion = new CourseSuggestion({
      name,
      email,
      title,
      description,
      category
    });

    await suggestion.save();

    if (req.io) {
      req.io.emit('new-course-suggestion', suggestion);
    }

    res.status(201).json({ message: 'Sugestão enviada com sucesso!', suggestion });
  } catch (error) {
    res.status(400).json({ message: 'Erro ao enviar sugestão', error: error.message });
  }
}; 

// @desc    Get all course suggestions
// @route   GET /api/courses/suggestions
// @access  Private/Admin
const getCourseSuggestions = async (req, res) => {
  try {
    const suggestions = await CourseSuggestion.find({}).sort({ createdAt: -1 });
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar sugestões', error: error.message });
  }
};

// @desc    Delete a review
// @route   DELETE /api/courses/reviews/:id
// @access  Private/Admin
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review não encontrada' });
    }
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: 'Review deletada com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar review', error: error.message });
  }
};

// @desc    Delete a course suggestion
// @route   DELETE /api/courses/suggestions/:id
// @access  Private/Admin
const deleteCourseSuggestion = async (req, res) => {
  try {
    const suggestion = await CourseSuggestion.findById(req.params.id);
    if (!suggestion) {
      return res.status(404).json({ message: 'Sugestão não encontrada' });
    }
    await CourseSuggestion.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sugestão deletada com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar sugestão', error: error.message });
  }
};

// @desc    Update a course suggestion
// @route   PUT /api/courses/suggestions/:id
// @access  Private/Admin
const updateCourseSuggestion = async (req, res) => {
  try {
    const { status } = req.body;
    const suggestion = await CourseSuggestion.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!suggestion) {
      return res.status(404).json({ message: 'Sugestão não encontrada' });
    }
    res.json(suggestion);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar sugestão', error: error.message });
  }
};
 
module.exports = { getCourses, getCourseById, createCourse, updateCourse, deleteCourse, createCourseReview, suggestCourse, getCourseSuggestions, getLatestReviews, getAllReviews, deleteReview, deleteCourseSuggestion, updateCourseSuggestion };
