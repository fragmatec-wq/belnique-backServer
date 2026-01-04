const Classroom = require('../models/Classroom');
const User = require('../models/User');
const logActivity = require('../utils/activityLogger');

exports.getAllClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find()
      .populate('course', 'title')
      .populate('professor', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const classroomsWithCount = classrooms.map(c => ({
      ...c,
      studentCount: c.students ? c.students.length : 0
    }));

    res.json(classroomsWithCount);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getClassroomsByProfessor = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ professor: req.user._id })
      .populate('course', 'title')
      .sort({ createdAt: -1 })
      .lean();

    const classroomsWithCount = classrooms.map(c => ({
      ...c,
      studentCount: c.students ? c.students.length : 0
    }));

    res.json(classroomsWithCount);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getStudentClassrooms = async (req, res) => {
  try {
    const classrooms = await Classroom.find({
      status: 'active',
      students: req.user._id
    })
      .populate('course', 'title')
      .populate('professor', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const classroomsWithCount = classrooms.map(c => ({
      ...c,
      studentCount: c.students ? c.students.length : 0
    }));

    res.json(classroomsWithCount);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAvailableCoursesForEnrollment = async (req, res) => {
  try {
    // Find all active classrooms and populate course details
    const classrooms = await Classroom.find({ status: 'active' })
      .populate('course');

    const availableCoursesMap = new Map();

    classrooms.forEach(classroom => {
      // Skip if course is missing (deleted?)
      if (!classroom.course) return;

      const studentCount = classroom.students ? classroom.students.length : 0;
      
      // Check if there is space
      if (studentCount < classroom.capacity) {
        const courseId = classroom.course._id.toString();
        
        // Add to map if not already added
        if (!availableCoursesMap.has(courseId)) {
          availableCoursesMap.set(courseId, {
            _id: classroom.course._id,
            title: classroom.course.title,
            description: classroom.course.description,
            thumbnail: classroom.course.thumbnail,
            studentCount: studentCount,
            capacity: classroom.capacity
          });
        }
      }
    });

    const availableCourses = Array.from(availableCoursesMap.values());
    res.json(availableCourses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.enrollStudent = async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user._id;

    // Check if already enrolled in any classroom for this course
    const existingEnrollment = await Classroom.findOne({
      course: courseId,
      students: userId,
      status: 'active'
    });

    if (existingEnrollment) {
      return res.status(400).json({ message: 'Você já está matriculado em uma sala deste curso.' });
    }

    // Find a classroom with space
    // We use aggregation pipeline in findOne or just iterate. 
    // Mongoose find() doesn't support $expr easily in all versions, but let's try standard approach
    // Fetch all active classrooms for course, sort by creation date (oldest first)
    const classrooms = await Classroom.find({
      course: courseId,
      status: 'active'
    }).sort({ createdAt: 1 });

    const availableClassroom = classrooms.find(c => {
      const studentCount = c.students ? c.students.length : 0;
      return studentCount < c.capacity;
    });

    if (!availableClassroom) {
      return res.status(404).json({ message: 'Não há vagas disponíveis para este curso no momento.' });
    }

    availableClassroom.students.push(userId);
    await availableClassroom.save();

    // Sync with User model
    await User.findByIdAndUpdate(userId, { $addToSet: { enrolledCourses: courseId } });

    res.json({ message: 'Matrícula realizada com sucesso!', classroomId: availableClassroom._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markLessonAsStudied = async (req, res) => {
  try {
    const { classroomId, lessonId } = req.params;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Initialize if undefined
    if (!user.completedLessons) {
      user.completedLessons = [];
    }

    const lessonIndex = user.completedLessons.indexOf(lessonId);

    if (lessonIndex > -1) {
      // Already completed, remove it (toggle off)
      user.completedLessons.splice(lessonIndex, 1);
    } else {
      // Add it
      user.completedLessons.push(lessonId);
      // Log study activity
      if (!user.studyLog) {
        user.studyLog = [];
      }
      user.studyLog.push(new Date());
    }

    await user.save();

    res.json({ 
      message: lessonIndex > -1 ? 'Aula marcada como não estudada' : 'Aula marcada como estudada',
      completed: lessonIndex === -1 // Return new state
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getClassroomById = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id)
      .populate('course', 'title')
      .populate('professor', 'name')
      .lean();
      
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    classroom.studentCount = classroom.students ? classroom.students.length : 0;

    // Student specific logic
    if (req.user && (req.user.role === 'student' || req.user.role === 'collector')) {
        const user = await User.findById(req.user._id);
        // Ensure completedLessons is initialized
        if (!user.completedLessons) {
            user.completedLessons = [];
        }
        
        const completedLessons = user.completedLessons.map(id => id.toString());
        let userModified = false;

        const now = new Date();
        
        if (classroom.lessons && Array.isArray(classroom.lessons)) {
            classroom.lessons = classroom.lessons.map(lesson => {
                let isCompleted = completedLessons.includes(lesson._id.toString());
                
                // Auto-mark logic for online lessons
                if (!isCompleted && lesson.mode === 'online' && lesson.date && lesson.time) {
                    try {
                        const lessonDate = new Date(lesson.date);
                        const [hours, minutes] = lesson.time.split(':').map(Number);
                        
                        // Set time on the date object
                        // Note: lesson.date from DB might be UTC or local. 
                        // Assuming standard Date object handling.
                        lessonDate.setHours(hours, minutes, 0, 0);

                        // Assume lesson duration is 2 hours for safety/default
                        const endTime = new Date(lessonDate.getTime() + 2 * 60 * 60 * 1000); 

                        if (endTime < now) {
                            // Mark as completed
                            user.completedLessons.push(lesson._id);
                            userModified = true;
                            isCompleted = true;
                            // Update local list for subsequent checks in this loop if needed (not needed here)
                        }
                    } catch (e) {
                        console.error('Error parsing date/time for auto-complete:', e);
                    }
                }

                return {
                    ...lesson,
                    completed: isCompleted
                };
            });
        }

        if (userModified) {
            await user.save();
        }
    }

    res.json(classroom);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createClassroom = async (req, res) => {
  const classroom = new Classroom({
    name: req.body.name,
    description: req.body.description,
    course: req.body.course,
    professor: req.body.professor,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    capacity: req.body.capacity,
    status: req.body.status
  });

  try {
    const newClassroom = await classroom.save();
    // Populate before sending back
    await newClassroom.populate('course', 'title');
    await newClassroom.populate('professor', 'name');

    if (req.user) {
        const isRealAdmin = req.user.role === 'administrator1' || req.user.role === 'Superadministrator2';
        await logActivity({
            user: isRealAdmin ? undefined : req.user._id,
            admin: isRealAdmin ? req.user._id : undefined,
            action: 'CLASSROOM_CREATE',
            details: `New classroom created: ${newClassroom.name}`,
            targetId: newClassroom._id
        });
    }

    res.status(201).json(newClassroom);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    if (req.body.name !== undefined) classroom.name = req.body.name;
    if (req.body.description !== undefined) classroom.description = req.body.description;
    if (req.body.course !== undefined) classroom.course = req.body.course;
    if (req.body.professor !== undefined) classroom.professor = req.body.professor;
    if (req.body.startDate !== undefined) classroom.startDate = req.body.startDate;
    if (req.body.endDate !== undefined) classroom.endDate = req.body.endDate;
    if (req.body.capacity !== undefined) classroom.capacity = req.body.capacity;
    if (req.body.status !== undefined) classroom.status = req.body.status;

    const updatedClassroom = await classroom.save();
    await updatedClassroom.populate('course', 'title');
    await updatedClassroom.populate('professor', 'name');
    
    if (req.user) {
        const isRealAdmin = req.user.role === 'administrator1' || req.user.role === 'Superadministrator2';
        await logActivity({
            user: isRealAdmin ? undefined : req.user._id,
            admin: isRealAdmin ? req.user._id : undefined,
            action: 'CLASSROOM_UPDATE',
            details: `Classroom updated: ${updatedClassroom.name}`,
            targetId: updatedClassroom._id
        });
    }

    res.json(updatedClassroom);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }
    await classroom.deleteOne();

    if (req.user) {
        const isRealAdmin = req.user.role === 'administrator1' || req.user.role === 'Superadministrator2';
        await logActivity({
            user: isRealAdmin ? undefined : req.user._id,
            admin: isRealAdmin ? req.user._id : undefined,
            action: 'CLASSROOM_DELETE',
            details: `Classroom deleted: ${classroom.name}`,
            targetId: classroom._id
        });
    }

    res.json({ message: 'Classroom deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get students enrolled in the course of a classroom
// @route   GET /api/classrooms/:id/students
// @access  Private
exports.getClassroomStudents = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id).populate('course', '_id title');
    if (!classroom) return res.status(404).json({ message: 'Classroom not found' });
    if (!classroom.course) return res.json([]);

    const students = await User.find({ role: { $in: ['student', 'collector'] }, enrolledCourses: { $in: [classroom.course._id] } })
      .select('name email profileImage createdAt');
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Add lesson to classroom
// @route   POST /api/classrooms/:id/lessons
// @access  Private/Admin
exports.addLesson = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) return res.status(404).json({ message: 'Classroom not found' });

    const {
      title,
      type,
      mode,
      date,
      time,
      location,
      meetingLink,
      accessCode,
      videoUrl
    } = req.body;

    let supportMaterial = undefined;
    let videoPath = undefined;

    if (req.files) {
      if (req.files.material) {
        supportMaterial = `/uploads/${req.files.material[0].filename}`;
      }
      if (req.files.video) {
        videoPath = `/uploads/${req.files.video[0].filename}`;
      }
    }

    const lesson = {
      title,
      type,
      mode,
      date: date ? new Date(date) : undefined,
      time,
      location,
      meetingLink,
      accessCode,
      videoUrl,
      videoPath,
      supportMaterial,
      createdBy: req.user ? req.user._id : undefined
    };

    classroom.lessons = classroom.lessons || [];
    classroom.lessons.push(lesson);
    await classroom.save();

    res.status(201).json(lesson);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateLessonStatus = async (req, res) => {
  try {
    const { classroomId, lessonId } = req.params;
    const { status } = req.body;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Check if user is admin or the professor of the classroom
    const isAdmin = ['admin', 'administrator1', 'Superadministrator2'].includes(req.user.role);
    if (!isAdmin && classroom.professor.toString() !== req.user._id.toString()) {
         return res.status(403).json({ message: 'Not authorized to update this lesson' });
    }

    const lesson = classroom.lessons.id(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    lesson.status = status;
    await classroom.save();

    res.json(lesson);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
