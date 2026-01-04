const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const logActivity = require('../utils/activityLogger');
const sendEmail = require('../utils/sendEmail');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const Classroom = require('../models/Classroom'); // Import Classroom model
const Assessment = require('../models/Assessment'); // Import Assessment model
const Activity = require('../models/Activity'); // Import Activity model
const Artwork = require('../models/Artwork'); // Import Artwork model

// @desc    Auth user with Google
// @route   POST /api/users/google-login
// @access  Public
const authGoogle = async (req, res) => {
  const { token, role } = req.body;
  
  try {
    // Validate access_token by fetching user info from Google
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`);
    
    if (!response.ok) {
        return res.status(400).json({ message: 'Token do Google inválido' });
    }
    
    const googleUser = await response.json();
    const { email, name, picture, sub } = googleUser;
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (user) {
        if (user.isBlocked) {
           return res.status(403).json({ 
             message: 'Sua conta foi bloqueada. Entre em contato com o suporte.',
             code: 'ACCOUNT_BLOCKED'
           });
        }
 
        // If se o usuário existe, retorna o token
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            bio: user.bio,
            phone: user.phone,
            gender: user.gender,
            birthDate: user.birthDate,
            location: user.location,
            website: user.website,
            specialization: user.specialization,
            avatar: user.profileImage,
            preferences: user.preferences,
            points: user.points,
            level: user.level,
            token: generateToken(user._id),
        }); 
    } else {
        // Se o usuario não existir, cria um novo
        const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
        
        user = await User.create({
            name,
            email,
            password: randomPassword,
            role: role || 'student', // Use provided role or default to student
            profileImage: picture,
            googleId: sub,
            isVerified: true
        });
        
        if (user) {
             logActivity({
              user: user._id,
              action: 'USER_REGISTER_GOOGLE',
              details: `Novo usuário registrado via Google: ${user.name} (${user.role})`,
              targetId: user._id
            });

            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                bio: user.bio,
                avatar: user.profileImage,
                preferences: user.preferences,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Dados de usuário inválidos' });
        }
    }
    
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(400).json({ message: 'Falha na autenticação com Google' });
  }
};
 
// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    // Check if user is blocked
    if (user.isBlocked) {
       return res.status(403).json({ 
         message: 'Sua conta foi bloqueada. Entre em contato com o suporte.',
         code: 'ACCOUNT_BLOCKED'
       });
    }

    // Check if user is verified
    if (!user.isVerified) {
       return res.status(403).json({ 
         message: 'Email não verificado. Por favor, verifique seu email.',
         code: 'EMAIL_NOT_VERIFIED',
         email: user.email 
       });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio,
      phone: user.phone,
      location: user.location,
      website: user.website,
      specialization: user.specialization,
      avatar: user.profileImage,
      preferences: user.preferences,
      points: user.points,
      level: user.level,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: 'E-mail ou palavra-passe Inválido!' });
  }
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, gender, birthDate } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    // Gerar token de verificação
    const verificationToken = crypto.randomBytes(20).toString('hex');

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'student', // Default to student
      gender,
      birthDate,
      verificationToken,
      isVerified: false // Usuário começa não verificado
    });

    if (user) {
      // Enviar email de verificação
      const origin = req.headers.origin;
      const baseClientUrl = process.env.CLIENT_URL || origin || 'http://localhost:5173';
      const verificationUrl = `${baseClientUrl}/verify-email?token=${verificationToken}`;
      
      try {
        await sendEmail({
          email: user.email,
          subject: 'Verifique seu email - Ateliê Belnique',
          message: `Por favor, verifique seu email clicando no link: ${verificationUrl}`,
          html: `
            <h1>Bem-vindo(a) à Ateliê Belnique!</h1>
            <p>Por favor, verifique seu email clicando no botão abaixo:</p>
            <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verificar Email</a>
            <p>Ou copie e cole este link no seu navegador:</p>
            <p>${verificationUrl}</p>
          `
        });
      } catch (emailError) {
        console.error('Erro ao enviar email de verificação:', emailError);
        // Não falhamos o registro se o email falhar, mas logamos o erro.
        // O usuário poderá pedir reenvio depois (feature futura).
      }

      // Log Activity
      logActivity({
        user: user._id,
        action: 'USER_REGISTER',
        details: `New user registered: ${user.name} (${user.role})`,
        targetId: user._id
      });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        avatar: user.profileImage,
        gender: user.gender,
        birthDate: user.birthDate,
        preferences: user.preferences,
        message: 'Cadastro realizado com sucesso. Verifique seu email para ativar a conta.'
        // Token removido para impedir login automático antes da verificação
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ message: 'Erro interno no servidor ao registrar usuário' });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      bio: user.bio,
      phone: user.phone,
      location: user.location,
      website: user.website,
      specialization: user.specialization,
      avatar: user.profileImage,
      preferences: user.preferences,
      points: user.points,
      level: user.level,
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: "i" } },
          { email: { $regex: req.query.search, $options: "i" } },
        ],
      }
    : {};

  const users = await User.find(keyword).find({ _id: { $ne: req.user._id } });
  res.json(users);
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.bio = req.body.bio || user.bio;
    user.phone = req.body.phone || user.phone;
    user.location = req.body.location || user.location;
    user.website = req.body.website || user.website;
    
    if (req.body.gender) user.gender = req.body.gender;
    if (req.body.birthDate) user.birthDate = req.body.birthDate;

    if (user.role === 'professor' && req.body.specialization) {
        user.specialization = req.body.specialization;
    }

    if (req.body.avatar !== undefined) {
      user.profileImage = req.body.avatar;
    }
    if (req.body.password) {
      user.password = req.body.password;
    }
    
    // Update preferences if provided
    if (req.body.preferences) {
      user.preferences = {
        ...user.preferences,
        ...req.body.preferences,
        notifications: { ...user.preferences.notifications, ...req.body.preferences.notifications },
        appearance: { ...user.preferences.appearance, ...req.body.preferences.appearance },
        privacy: { ...user.preferences.privacy, ...req.body.preferences.privacy },
        studentMode: req.body.preferences.studentMode !== undefined ? req.body.preferences.studentMode : user.preferences.studentMode
      };
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      location: updatedUser.location,
      website: updatedUser.website,
      specialization: updatedUser.specialization,
      avatar: updatedUser.profileImage,
      preferences: updatedUser.preferences,
      points: updatedUser.points,
      level: updatedUser.level,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

const getDashboardStats = async (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  let stats = {};

  if (user.role === 'student') {
    // Compute real stats based on enrolled courses and related classrooms
    const enrolledCount = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.length : 0;
    let classroomsCount = 0;
    let totalLessons = 0;
    let completedLessons = 0;

    if (enrolledCount > 0) {
      const classrooms = await Classroom.find({ 
          status: 'active', 
          course: { $in: user.enrolledCourses },
          students: user._id // Only count classrooms where the student is actually enrolled
      });
      classroomsCount = classrooms.length;
      classrooms.forEach(c => {
        if (Array.isArray(c.lessons)) {
          totalLessons += c.lessons.length;
          // Calculate completed lessons based on user.completedLessons
          if (user.completedLessons && user.completedLessons.length > 0) {
            const completedLessonIds = user.completedLessons.map(id => id.toString());
            completedLessons += c.lessons.filter(l => completedLessonIds.includes(l._id.toString())).length;
          }
        }
      });
    } else {
      classroomsCount = 0;
    }

    const averageProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    stats = {
      enrolledCourses: enrolledCount,
      averageProgress,
      completedLessons,
      classrooms: classroomsCount,
      studyDays: user.studyLog || []
    };
  } else if (user.role === 'professor') {
    // Fetch real stats for professor
    const activeClasses = await Classroom.countDocuments({ professor: user._id, status: 'active' });
    
    // Calculate total lessons and next class
    const classrooms = await Classroom.find({ professor: user._id, status: 'active' });
    
    // Calculate total students
    const courseIds = classrooms.map(c => c.course).filter(id => id);
    const totalStudents = await User.countDocuments({ enrolledCourses: { $in: courseIds }, role: 'student' });

    let totalLessons = 0;
    let allScheduledLessons = [];
    const now = new Date();

    classrooms.forEach(classroom => {
      if (classroom.lessons) {
        totalLessons += classroom.lessons.length;
        classroom.lessons.forEach(lesson => {
           if (lesson.type === 'scheduled' && lesson.status === 'scheduled' && lesson.date) {
             const lessonDate = new Date(lesson.date);
             if (lessonDate > now) {
                allScheduledLessons.push({
                    _id: lesson._id,
                    title: lesson.title,
                    date: lessonDate,
                    time: lesson.time,
                    classroomName: classroom.name,
                    mode: lesson.mode,
                    location: lesson.location
                });
             }
           }
        });
      }
    });

    // Sort by date ascending
    allScheduledLessons.sort((a, b) => a.date - b.date);
    const upcomingClasses = allScheduledLessons.slice(0, 2);
    const nextClassData = upcomingClasses.length > 0 ? upcomingClasses[0] : null;

    let nextClassString = 'Nenhuma aula agendada';
    if (nextClassData) {
       const dateStr = nextClassData.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
       nextClassString = `${nextClassData.title} (${dateStr} - ${nextClassData.time})`;
    }

    stats = {
      totalStudents,
      activeClasses,
      totalLessons,
      nextClass: nextClassString,
      nextClassData,
      upcomingClasses // Return top 2
    };
  } else if (user.role === 'collector') {
    // 1. Acquired Artworks count
    const acquiredArtworksCount = user.ownedArtworks ? user.ownedArtworks.length : 0;
    
    // Get full acquired artworks details
    let recentAcquired = [];
    if (acquiredArtworksCount > 0) {
        recentAcquired = await Artwork.find({ 
            _id: { $in: user.ownedArtworks } 
        }).select('title images price createdAt artist');
    }

    // 2. Favorites count
    const favoritesCount = user.favorites ? user.favorites.length : 0;
    
    // Get full favorites details
    let recentFavorites = [];
    if (favoritesCount > 0) {
        recentFavorites = await Artwork.find({ 
            _id: { $in: user.favorites } 
        }).select('title images price artist');
    }

    // 3. Activity Level (count of activities in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activityLevel = await Activity.countDocuments({ 
        user: user._id,
        createdAt: { $gte: thirtyDaysAgo },
        action: { $nin: ['USER_REGISTER', 'USER_REGISTER_GOOGLE'] } // Exclude registration logs
    });
    
    // Get recent activity details
    const recentActivity = await Activity.find({ 
        user: user._id,
        action: { $nin: ['USER_REGISTER', 'USER_REGISTER_GOOGLE'] } // Exclude registration logs
    }).sort({ createdAt: -1 }).limit(10);

    // 4. Balance (Sum of prices of owned artworks)
    let balance = 0;
    if (recentAcquired.length > 0) {
        balance = recentAcquired.reduce((acc, artwork) => {
            const price = artwork.type === 'auction' ? (artwork.currentBid || 0) : (artwork.price || 0);
            return acc + price;
        }, 0);
    }

    // Calculate student stats for collector (Hybrid Mode)
    let collectorClassroomsCount = 0;
    let collectorTotalLessons = 0;
    let collectorCompletedLessons = 0;

    if (user.enrolledCourses && user.enrolledCourses.length > 0) {
      const classrooms = await Classroom.find({ 
          status: 'active', 
          course: { $in: user.enrolledCourses },
          students: user._id 
      });
      collectorClassroomsCount = classrooms.length;
      classrooms.forEach(c => {
        if (Array.isArray(c.lessons)) {
          collectorTotalLessons += c.lessons.length;
          if (user.completedLessons && user.completedLessons.length > 0) {
            const completedLessonIds = user.completedLessons.map(id => id.toString());
            collectorCompletedLessons += c.lessons.filter(l => completedLessonIds.includes(l._id.toString())).length;
          }
        }
      });
    }

    const collectorAverageProgress = collectorTotalLessons > 0 ? Math.round((collectorCompletedLessons / collectorTotalLessons) * 100) : 0;

    stats = {
      acquiredArtworks: acquiredArtworksCount,
      recentAcquired, // Added
      favorites: favoritesCount,
      recentFavorites, // Added
      activityLevel: activityLevel,
      recentActivity, // Added
      balance: balance,
      // Include student stats for hybrid mode
      studentStats: {
        enrolledCourses: user.enrolledCourses ? user.enrolledCourses.length : 0,
        averageProgress: collectorAverageProgress,
        completedLessons: collectorCompletedLessons,
        classrooms: collectorClassroomsCount,
        studyDays: user.studyLog || []
      }
    };
  }

  res.json(stats);
};

// @desc    Get all students for professor
// @route   GET /api/users/professor/students
// @access  Private (Professor)
const getProfessorStudents = async (req, res) => {
  const classrooms = await Classroom.find({ professor: req.user._id });
  const courseIds = classrooms.map(c => c.course).filter(id => id);
  
  const students = await User.find({ 
    enrolledCourses: { $in: courseIds }, 
    role: { $in: ['student', 'collector'] }
  }).select('name profileImage phone email');

  res.json(students);
};

// @desc    Get all scheduled lessons for professor
// @route   GET /api/users/professor/schedule
// @access  Private (Professor)
const getProfessorSchedule = async (req, res) => {
  const classrooms = await Classroom.find({ professor: req.user._id }).populate('course', 'title');
  let schedule = [];

  classrooms.forEach(classroom => {
    if (classroom.lessons) {
      classroom.lessons.forEach(lesson => {
         if (lesson.type === 'scheduled' && lesson.status !== 'cancelled') {
           schedule.push({
             ...lesson.toObject(),
             classroomName: classroom.name,
             courseName: classroom.course ? classroom.course.title : 'N/A',
             classroomId: classroom._id
           });
         }
      });
    }
  });

  // Sort by date
  schedule.sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(schedule);
};

// @desc    Get all assessments for professor
// @route   GET /api/users/professor/assessments
// @access  Private (Professor)
const getProfessorAssessments = async (req, res) => {
    const assessments = await Assessment.find({ professor: req.user._id })
                                      .populate('classroom', 'name')
                                      .sort({ createdAt: -1 });
    res.json(assessments);
};

// @desc    Get enrolled courses for student
// @route   GET /api/users/my-courses
// @access  Private (Student)
const getStudentCourses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || (user.role !== 'student' && user.role !== 'collector')) {
        return res.status(403).json({ message: 'Acesso negado' });
    }

    // Find classrooms where the student is enrolled
    const classrooms = await Classroom.find({ 
        students: req.user._id,
        status: 'active'
    }).populate('course');

    // Extract courses from classrooms and format them
    const courses = classrooms.map(classroom => {
        if (!classroom.course) return null;

        // Calculate progress
        let progress = 0;
        if (classroom.lessons && classroom.lessons.length > 0) {
            const totalLessons = classroom.lessons.length;
            let completedCount = 0;
            
            if (user.completedLessons && user.completedLessons.length > 0) {
                const completedLessonIds = user.completedLessons.map(id => id.toString());
                completedCount = classroom.lessons.filter(l => completedLessonIds.includes(l._id.toString())).length;
            }
            
            progress = Math.round((completedCount / totalLessons) * 100);
        }

        return {
            id: classroom.course._id,
            title: classroom.course.title,
            instructor: classroom.course.instructor ? 'Belnique' : 'Unknown', // Ideally populate instructor too if needed
            progress: progress,
            cover: classroom.course.thumbnail,
            classroomId: classroom._id,
            studentCount: classroom.students ? classroom.students.length : 0,
            capacity: classroom.capacity || 0
        };
    }).filter(c => c !== null);

    res.json(courses); 
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Get user's gallery (owned artworks)
// @route   GET /api/users/gallery
// @access  Private
const getMyGallery = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'ownedArtworks',
      populate: { path: 'artist', select: 'name' }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.ownedArtworks || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Verify email
// @route   POST /api/users/verify-email
// @access  Public
const verifyEmail = async (req, res) => {
  const { token } = req.body;

  const user = await User.findOne({ verificationToken: token });

  if (!user) {
    return res.status(400).json({ message: 'Token inválido ou expirado' });
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  await user.save();

  res.json({
    message: 'Email verificado com sucesso',
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    bio: user.bio,
    phone: user.phone,
    location: user.location,
    website: user.website,
    specialization: user.specialization,
    avatar: user.profileImage,
    preferences: user.preferences,
    points: user.points,
    level: user.level,
    token: generateToken(user._id),
  });
};

// @desc    Forgot Password
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'Email não cadastrado' });
    }

    // Get reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set expire
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    const origin = req.headers.origin;
    const baseClientUrl = process.env.CLIENT_URL || origin || 'http://localhost:5173';
    const resetUrl = `${baseClientUrl}/reset-password/${resetToken}`;

    const message = `
      <h1>Você solicitou uma redefinição de senha</h1>
      <p>Por favor, vá para este link para redefinir sua senha:</p>
      <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Redefinição de Senha - Ateliê Belnique',
        message: `Link de redefinição: ${resetUrl}`,
        html: message
      });

      res.status(200).json({ success: true, data: 'Email enviado' });
    } catch (err) {
      console.error(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      return res.status(500).json({ message: 'Email não pôde ser enviado' });
    }
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};

// @desc    Reset Password
// @route   PUT /api/users/reset-password/:resetToken
// @access  Public
const resetPassword = async (req, res) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resetToken)
    .digest('hex');

  try {
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token inválido ou expirado' });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      data: 'Senha atualizada com sucesso',
      token: generateToken(user._id)
    });
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
};

// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
const logoutUser = async (req, res) => {
  if (req.user) {
    const isRealAdmin = req.user.role === 'administrator1' || req.user.role === 'Superadministrator2';
    
    logActivity({
      user: isRealAdmin ? undefined : req.user._id,
      admin: isRealAdmin ? req.user._id : undefined,
      action: 'LOGOUT',
      details: 'Usuário realizou logout do sistema',
      targetId: req.user._id
    });
  }
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = {
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
};
