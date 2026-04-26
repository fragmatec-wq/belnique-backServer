const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const logActivity = require('../utils/activityLogger');
const sendEmail = require('../utils/sendEmail');
const Classroom = require('../models/Classroom');
const Assessment = require('../models/Assessment');
const Activity = require('../models/Activity');
const Artwork = require('../models/Artwork');
const Course = require('../models/Course');
const Event = require('../models/Event');
const BlogPost = require('../models/BlogPost');
const Post = require('../models/Post');
const Review = require('../models/Review');
const Article = require('../models/Article');
const Order = require('../models/Order');

const logoPath = path.join(__dirname, '../src/logo.png');
let logoDataUrl = '';

try {
  const logoBuffer = fs.readFileSync(logoPath);
  logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (logoError) {
  console.error('[UserController] Falha ao carregar logo para email:', logoError);
}

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const checkDependencies = async (userId) => {
    const coursesTeachingCount = await Course.countDocuments({ instructor: userId });
    const coursesEnrolledCount = await Course.countDocuments({ studentsEnrolled: userId });
    const artworksCount = await Artwork.countDocuments({ artist: userId });
    const eventsOrganizedCount = await Event.countDocuments({ organizer: userId });
    const eventsAttendingCount = await Event.countDocuments({ attendees: userId });
    const blogPostsCount = await BlogPost.countDocuments({ author: userId });
    const postsCount = await Post.countDocuments({ author: userId });
    const reviewsCount = await Review.countDocuments({ user: userId });
    const articlesCount = await Article.countDocuments({ author: userId });
    const ordersCount = await Order.countDocuments({ user: userId });

    const hasDependencies = 
      coursesTeachingCount > 0 || 
      coursesEnrolledCount > 0 || 
      artworksCount > 0 || 
      eventsOrganizedCount > 0 || 
      eventsAttendingCount > 0 || 
      blogPostsCount > 0 || 
      postsCount > 0 ||
      reviewsCount > 0 ||
      articlesCount > 0 ||
      ordersCount > 0;
      
    if (hasDependencies) {
        const reasons = [];
        if (coursesTeachingCount > 0) reasons.push('Cursos criados');
        if (coursesEnrolledCount > 0) reasons.push('Matrículas em cursos');
        if (artworksCount > 0) reasons.push('Obras de arte');
        if (eventsOrganizedCount > 0) reasons.push('Eventos organizados');
        if (eventsAttendingCount > 0) reasons.push('Participação em eventos');
        if (blogPostsCount > 0) reasons.push('Postagens no blog');
        if (postsCount > 0) reasons.push('Postagens na comunidade');
        if (reviewsCount > 0) reasons.push('Avaliações');
        if (articlesCount > 0) reasons.push('Artigos publicados');
        if (ordersCount > 0) reasons.push('Histórico de pedidos');
        return { hasDependencies: true, reasons };
    }
    return { hasDependencies: false };
};

// @desc    Auth user with Google
// @route   POST /api/users/google-login
// @access  Public
const authGoogle = async (req, res) => {
  const { token, role } = req.body;
  
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`);
    
    if (!response.ok) {
        return res.status(400).json({ message: 'Token do Google inválido' });
    }
    
    const googleUser = await response.json();
    const { email, name, picture, sub } = googleUser;
    
    let user = await User.findOne({ email });
    
    if (user) {
        if (user.isBlocked) {
           return res.status(403).json({ 
             message: 'Sua conta foi bloqueada. Entre em contato com o suporte.',
             code: 'ACCOUNT_BLOCKED'
           });
        }
 
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            secondaryRoles: user.secondaryRoles,
            bio: user.bio,
            phone: user.phone,
            gender: user.gender,
            birthDate: user.birthDate,
            experience: user.experience,
            gostos: user.gostos,
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
        const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
        
        user = await User.create({
            name,
            email,
            password: randomPassword,
            role: role || 'student',
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
                secondaryRoles: user.secondaryRoles,
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

  console.log(user.gender)

  if (user && (await user.matchPassword(password))) {
    if (user.isBlocked) {
       return res.status(403).json({ 
         message: 'Sua conta foi bloqueada. Entre em contato com o suporte.',
         code: 'ACCOUNT_BLOCKED'
       });
    }

    if (!user.isVerified) {
       return res.status(403).json({ 
         message: 'Email não verificado. Por favor, verifique seu email.',
         code: 'EMAIL_NOT_VERIFIED',
         email: user.email 
       });
    }

    console.log(`Género: ${user.gender} do usuário ${user.name}`); // Log do gênero do usuário

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      gender: user.gender,
      secondaryRoles: user.secondaryRoles,
      bio: user.bio,
      phone: user.phone,
      location: user.location,
      website: user.website,
      specialization: user.specialization,
      avatar: user.profileImage,
      preferences: user.preferences,
      points: user.points,
      level: user.level,
      interests: user.interests,
      experience: user.experience,
      gostos: user.gostos,
      token: generateToken(user._id),
      gend: {gender: user.gender},
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
    const { name, email, password, role, gender, birthDate, phone, experience, gostos } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    const verificationToken = crypto.randomBytes(20).toString('hex');

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'student',
      gender,
      birthDate,
      phone,
      experience,
      gostos,
      verificationToken,
      isVerified: false
    });

    if (user) {
      const origin = req.headers.origin;
      const baseClientUrl = process.env.CLIENT_URL || origin || 'https://ateliebelnique.vercel.app';
      const verificationUrl = `${baseClientUrl}/verify-email?token=${verificationToken}`;
      const firstName = name ? name.split(' ')[0] : 'Artista';
      
      const emailHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8" />
            <title>Verifique seu email</title>
          </head>
          <body style="margin:0;padding:0;background:#f5f6fb;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td align="center" style="padding: 20px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.08);margin:0 auto;">
                    <tr>
                      <td align="center" style="background: linear-gradient(135deg, #6D5BFF, #2A2A2A); padding: 28px 16px;">
                        ${logoDataUrl ? `<img src="${logoDataUrl}" width="160" alt="Ateliê Belnique" style="display:block;border:0;outline:none;text-decoration:none;" />` : '<h2 style="color:#ffffff;margin:0;">Ateliê Belnique</h2>'}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:32px 32px 24px;color:#333333;font-family:Arial, sans-serif;">
                        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:#111111;">Olá ${firstName}, seja bem-vindo(a)!</h1>
                        <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#555555;">
                          Seu cadastro no Ateliê Belnique foi criado com sucesso. Para completar a ativação da sua conta, confirme seu e-mail clicando no botão abaixo.
                        </p>
                        <p style="margin:0 0 28px;text-align:center;">
                          <a href="${verificationUrl}" style="display:inline-block;padding:14px 28px;border-radius:30px;background:#6D5BFF;color:#ffffff;text-decoration:none;font-weight:bold;">Confirmar meu e-mail</a>
                        </p>
                        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#777777;">Se o botão acima não funcionar, copie e cole o link abaixo no seu navegador:</p>
                        <p style="margin:0 0 0;font-size:14px;line-height:1.6;color:#1a73e8;word-break:break-all;">${verificationUrl}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f8f9ff;padding:24px 32px;font-size:14px;color:#777777;font-family:Arial, sans-serif;">
                        <p style="margin:0 0 8px;">Se você não solicitou este cadastro, pode ignorar esta mensagem.</p>
                        <p style="margin:0;">Ateliê Belnique — A arte de transformar talento em expressão.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;
      
      try {
        await sendEmail({
          email: user.email,
          subject: 'Verifique seu email - Ateliê Belnique',
          message: `Por favor, verifique seu email clicando no link: ${verificationUrl}`,
          html: emailHtml
        });
      } catch (emailError) {
        console.error('Erro ao enviar email de verificação:', emailError);
      }

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
        secondaryRoles: user.secondaryRoles,
        bio: user.bio,
        avatar: user.profileImage,
        gender: user.gender,
        birthDate: user.birthDate,
        phone: user.phone,
        experience: user.experience,
        gostos: user.gostos,
        preferences: user.preferences,
        message: 'Cadastro realizado com sucesso. Verifique seu email para ativar a conta.'
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
      secondaryRoles: user.secondaryRoles,
      bio: user.bio,
      phone: user.phone,
      gender: user.gender,
      birthDate: user.birthDate,
      experience: user.experience,
      gostos: user.gostos,
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

// @desc    Update user heartbeat
// @route   POST /api/users/heartbeat
// @access  Private
const updateHeartbeat = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: true,
      lastActiveAt: new Date()
    });
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error("Heartbeat error:", error);
    res.status(500).json({ message: 'Error updating heartbeat' });
  }
};

// @desc    Get online users (active in last 2 mins)
// @route   GET /api/users/online
// @access  Private
const getOnlineUsers = async (req, res) => {
  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    const onlineUsers = await User.find({
      lastActiveAt: { $gte: twoMinutesAgo }
    }).select('_id name profileImage role');
    
    res.json(onlineUsers.map(u => u._id));
  } catch (error) {
    console.error("Get online users error:", error);
    res.status(500).json({ message: 'Error fetching online users' });
  }
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
    if (req.body.experience) user.experience = req.body.experience;
    if (req.body.gostos) user.gostos = req.body.gostos;

    if (user.role === 'professor' && req.body.specialization) {
        user.specialization = req.body.specialization;
    }

    if (req.body.avatar !== undefined) {
      user.profileImage = req.body.avatar;
    }
    if (req.body.password) {
      user.password = req.body.password;
    }
    
    if (req.body.preferences) {
      user.preferences = {
        ...user.preferences,
        ...req.body.preferences,
        notifications: { ...user.preferences.notifications, ...req.body.preferences.notifications },
        appearance: { ...user.preferences.appearance, ...req.body.preferences.appearance },
        privacy: { ...user.preferences.privacy, ...req.body.preferences.privacy },
        studentMode: req.body.preferences.studentMode !== undefined ? req.body.preferences.studentMode : user.preferences.studentMode,
        collectorMode: req.body.preferences.collectorMode !== undefined ? req.body.preferences.collectorMode : user.preferences.collectorMode
      };
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      secondaryRoles: updatedUser.secondaryRoles,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      location: updatedUser.location,
      website: updatedUser.website,
      specialization: updatedUser.specialization,
      avatar: updatedUser.profileImage,
      gender: updatedUser.gender,
      birthDate: updatedUser.birthDate,
      experience: updatedUser.experience,
      gostos: updatedUser.gostos,
      preferences: updatedUser.preferences,
      points: updatedUser.points,
      level: updatedUser.level,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Update user preferences after first login
// @route   PUT /api/users/update-preferences
// @access  Private
const updateUserPreferences = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    if (req.body.interests) user.interests = req.body.interests;
    if (req.body.experience) user.experience = req.body.experience;
    if (req.body.gostos) user.gostos = req.body.gostos;

    user.first_login = false;
    user.IPs_User.push(req.ip);

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      secondaryRoles: updatedUser.secondaryRoles,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      location: updatedUser.location,
      website: updatedUser.website,
      specialization: updatedUser.specialization,
      avatar: updatedUser.profileImage,
      gender: updatedUser.gender,
      birthDate: updatedUser.birthDate,
      experience: updatedUser.experience,
      gostos: updatedUser.gostos,
      interests: updatedUser.interests,
      preferences: updatedUser.preferences,
      points: updatedUser.points,
      level: updatedUser.level,
      first_login: updatedUser.first_login,
      IPs_User: updatedUser.IPs_User,
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
  let targetRole = user.role;
  if (req.query.role) {
      const allowedRoles = [user.role, ...(user.secondaryRoles || [])];
      if (allowedRoles.includes(req.query.role)) {
          targetRole = req.query.role;
      }
  }

  if (targetRole === 'student') {
    const enrolledCount = Array.isArray(user.enrolledCourses) ? user.enrolledCourses.length : 0;
    
    const classroomsPromise = enrolledCount > 0 
      ? Classroom.find({ 
          status: 'active', 
          course: { $in: user.enrolledCourses },
          students: user._id 
        }).lean()
      : Promise.resolve([]);

    const acquiredArtworksCount = user.ownedArtworks ? user.ownedArtworks.length : 0;
    const recentAcquiredPromise = acquiredArtworksCount > 0 
      ? Artwork.find({ 
          _id: { $in: user.ownedArtworks } 
        }).select('title images price createdAt artist').populate('artist', 'name').lean()
      : Promise.resolve([]);

    const favoritesCount = user.favorites ? user.favorites.length : 0;
    const recentFavoritesPromise = favoritesCount > 0
      ? Artwork.find({ 
          _id: { $in: user.favorites } 
        }).select('title images price artist').populate('artist', 'name').lean()
      : Promise.resolve([]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activityLevelPromise = Activity.countDocuments({ 
        user: user._id,
        createdAt: { $gte: thirtyDaysAgo },
        action: { $nin: ['USER_REGISTER', 'USER_REGISTER_GOOGLE'] } 
    });
    
    const recentActivityPromise = Activity.find({ 
        user: user._id,
        action: { $nin: ['USER_REGISTER', 'USER_REGISTER_GOOGLE'] } 
    }).sort({ createdAt: -1 }).limit(10).lean();

    const [classrooms, recentAcquired, recentFavorites, activityLevel, recentActivity] = await Promise.all([
      classroomsPromise,
      recentAcquiredPromise,
      recentFavoritesPromise,
      activityLevelPromise,
      recentActivityPromise
    ]);

    let classroomsCount = classrooms.length;
    let totalLessons = 0;
    let completedLessons = 0;

    classrooms.forEach(c => {
      if (Array.isArray(c.lessons)) {
        totalLessons += c.lessons.length;
        if (user.completedLessons && user.completedLessons.length > 0) {
          const completedLessonIds = user.completedLessons.map(id => id.toString());
          completedLessons += c.lessons.filter(l => completedLessonIds.includes(l._id.toString())).length;
        }
      }
    });

    const averageProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    let balance = 0;
    if (recentAcquired.length > 0) {
        balance = recentAcquired.reduce((acc, artwork) => {
            const price = artwork.type === 'auction' ? (artwork.currentBid || 0) : (artwork.price || 0);
            return acc + price;
        }, 0);
    }

    stats = {
      enrolledCourses: enrolledCount,
      averageProgress,
      completedLessons,
      classrooms: classroomsCount,
      studyDays: user.studyLog || [],
      acquiredArtworks: acquiredArtworksCount,
      recentAcquired,
      favorites: favoritesCount,
      recentFavorites,
      activityLevel: activityLevel,
      recentActivity,
      balance: balance
    };
  } else if (targetRole === 'professor') {
    const professorFilter = { $or: [{ professor: user._id }, { professors: user._id }] };

    const activeClassesPromise = Classroom.countDocuments({ 
        ...professorFilter,
        status: 'active',
        type: 'normal'
    });

    const homeServicesCountPromise = Classroom.countDocuments({
        ...professorFilter,
        status: 'active',
        type: 'home'
    });
    
    const classroomsPromise = Classroom.find({ 
        ...professorFilter,
        status: 'active' 
    }).lean();
    
    const [activeClasses, homeServicesCount, classrooms] = await Promise.all([
      activeClassesPromise,
      homeServicesCountPromise,
      classroomsPromise
    ]);

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
      homeServicesCount,
      totalLessons,
      nextClass: nextClassString,
      nextClassData,
      upcomingClasses
    };
  } else if (targetRole === 'collector') {
    const acquiredArtworksCount = user.ownedArtworks ? user.ownedArtworks.length : 0;
    
    let recentAcquired = [];
    if (acquiredArtworksCount > 0) {
        recentAcquired = await Artwork.find({ 
            _id: { $in: user.ownedArtworks } 
        }).select('title images price createdAt artist');
    }

    const favoritesCount = user.favorites ? user.favorites.length : 0;
    
    let recentFavorites = [];
    if (favoritesCount > 0) {
        recentFavorites = await Artwork.find({ 
            _id: { $in: user.favorites } 
        }).select('title images price artist');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activityLevel = await Activity.countDocuments({ 
        user: user._id,
        createdAt: { $gte: thirtyDaysAgo },
        action: { $nin: ['USER_REGISTER', 'USER_REGISTER_GOOGLE'] } 
    });
    
    const recentActivity = await Activity.find({ 
        user: user._id,
        action: { $nin: ['USER_REGISTER', 'USER_REGISTER_GOOGLE'] } 
    }).sort({ createdAt: -1 }).limit(10);

    let balance = 0;
    if (recentAcquired.length > 0) {
        balance = recentAcquired.reduce((acc, artwork) => {
            const price = artwork.type === 'auction' ? (artwork.currentBid || 0) : (artwork.price || 0);
            return acc + price;
        }, 0);
    }

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
      recentAcquired,
      favorites: favoritesCount,
      recentFavorites,
      activityLevel: activityLevel,
      recentActivity,
      balance: balance,
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

    const classrooms = await Classroom.find({ 
        students: req.user._id,
        status: 'active'
    }).populate('course');

    const courses = classrooms.map(c => ({
        _id: c.course._id,
        title: c.course.title,
        description: c.course.description,
        thumbnail: c.course.thumbnail,
        classroomId: c._id,
        progress: 0 
    }));

    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get home course details
// @route   GET /api/users/home-details/:courseId
// @access  Private
const getHomeDetails = async (req, res) => {
  try {
    let targetUserId = req.user._id;

    const isAdmin = ['admin', 'administrator1', 'Superadministrator2'].includes(req.user.role);
    if (isAdmin && req.query.studentId) {
        targetUserId = req.query.studentId;
    }

    const user = await User.findById(targetUserId);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const details = user.homeCourseDetails?.find(
      d => d.course.toString() === req.params.courseId
    );
    res.json(details || {});
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update home course details
// @route   PUT /api/users/home-details/:courseId
// @access  Private
const updateHomeDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const courseId = req.params.courseId;
    
    if (!user.homeCourseDetails) {
        user.homeCourseDetails = [];
    }

    const index = user.homeCourseDetails.findIndex(
      d => d.course.toString() === courseId
    );

    if (index > -1) {
      if (req.body.studentCount !== undefined) user.homeCourseDetails[index].studentCount = req.body.studentCount;
      if (req.body.ageRange !== undefined) user.homeCourseDetails[index].ageRange = req.body.ageRange;
      if (req.body.address !== undefined) user.homeCourseDetails[index].address = req.body.address;
      if (req.body.phoneNumber !== undefined) user.homeCourseDetails[index].phoneNumber = req.body.phoneNumber;
      if (req.body.notes !== undefined) user.homeCourseDetails[index].notes = req.body.notes;
      if (req.body.preferredSchedule !== undefined) user.homeCourseDetails[index].preferredSchedule = req.body.preferredSchedule;
      if (req.body.status !== undefined) user.homeCourseDetails[index].status = req.body.status;
    } else {
      user.homeCourseDetails.push({
        course: courseId,
        ...req.body
      });
    }

    await user.save();
    
    const updatedDetails = user.homeCourseDetails.find(d => d.course.toString() === courseId);
    res.json(updatedDetails);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -email -phone -address -documentType -documentNumber -resetPasswordToken -resetPasswordExpire -deletionCode -deletionCodeExpires -verificationToken')
      .populate('enrolledCourses', 'title')
      .lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return comprehensive public profile information respecting privacy
    const publicProfile = {
      id: user._id,
      name: user.name,
      role: user.role,
      phone: user.phone,
      secondaryRoles: user.secondaryRoles || [],
      bio: user.bio || '',
      profileImage: user.profileImage || null,
      gender: user.gender || null,
      birthDate: user.birthDate || null,
      experience: user.experience || null,
      gostos: user.gostos || [],
      specialization: user.specialization || null,
      points: user.points || 0,
      level: user.level || 1,
      location: user.location || null,
      website: user.website,
      isOnline: user.isOnline || false,
      preferences: {
        privacy: {
          profileVisibility: (user.preferences && user.preferences.privacy && user.preferences.privacy.profileVisibility) || 'public',
          showActivityStatus: (user.preferences && user.preferences.privacy && typeof user.preferences.privacy.showActivityStatus === 'boolean')
            ? user.preferences.privacy.showActivityStatus
            : true
        }
      },
      course: user.enrolledCourses && user.enrolledCourses.length > 0 
        ? user.enrolledCourses[0].title 
        : null,
      professorType: user.role === 'professor' ? user.professorType : null
    };
    
    res.json(publicProfile);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    gender: user.gender,
    birthDate: user.birthDate,
    experience: user.experience,
    gostos: user.gostos,
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

// @desc    Resend verification email
// @route   POST /api/users/resend-verification
// @access  Public
const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Este email já foi verificado' });
    }

    const verificationToken = crypto.randomBytes(20).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    const origin = req.headers.origin;
    const baseClientUrl = process.env.CLIENT_URL || origin || 'https://ateliebelnique.vercel.app';
    const verificationUrl = `${baseClientUrl}/verify-email?token=${verificationToken}`;

    const firstName = user.name ? user.name.split(' ')[0] : 'Artista';
    const emailHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Reenvio de verificação</title>
        </head>
        <body style="margin:0;padding:0;background:#f5f6fb;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td align="center" style="padding: 20px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.08);margin:0 auto;">
                  <tr>
                    <td align="center" style="background: linear-gradient(135deg, #6D5BFF, #2A2A2A); padding: 28px 16px;">
                      ${logoDataUrl ? `<img src="${logoDataUrl}" width="160" alt="Ateliê Belnique" style="display:block;border:0;outline:none;text-decoration:none;" />` : '<h2 style="color:#ffffff;margin:0;">Ateliê Belnique</h2>'}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 32px 24px;color:#333333;font-family:Arial, sans-serif;">
                      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:#111111;">Olá ${firstName}, aqui está seu novo link</h1>
                      <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#555555;">
                        Recebemos sua solicitação de reenvio do link de verificação. Clique no botão abaixo para confirmar seu email e ativar sua conta.
                      </p>
                      <p style="margin:0 0 28px;text-align:center;">
                        <a href="${verificationUrl}" style="display:inline-block;padding:14px 28px;border-radius:30px;background:#6D5BFF;color:#ffffff;text-decoration:none;font-weight:bold;">Confirmar meu e-mail</a>
                      </p>
                      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#777777;">Se o botão não funcionar, copie e cole o link abaixo no navegador:</p>
                      <p style="margin:0 0 0;font-size:14px;line-height:1.6;color:#1a73e8;word-break:break-all;">${verificationUrl}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#f8f9ff;padding:24px 32px;font-size:14px;color:#777777;font-family:Arial, sans-serif;">
                      <p style="margin:0 0 8px;">Se você não solicitou este email, ignore esta mensagem.</p>
                      <p style="margin:0;">Ateliê Belnique — o seu espaço para aprender, criar e inspirar.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Reenvio: Verifique seu email - Ateliê Belnique',
      message: `Por favor, verifique seu email clicando no link: ${verificationUrl}`,
      html: emailHtml
    });

    res.json({ message: 'Email de verificação reenviado com sucesso' });
  } catch (error) {
    console.error('Erro ao reenviar email:', error);
    res.status(500).json({ message: 'Erro ao enviar email' });
  }
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

    const resetToken = crypto.randomBytes(20).toString('hex');

    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();
 
    const origin = "https://ateliebelnique.vercel.app";
    const baseClientUrl = process.env.CLIENT_URL || origin || 'https://ateliebelnique.vercel.app';
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

// @desc    Export User Data
// @route   GET /api/users/export
// @access  Private
const exportUserData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Gather courses
    const enrolledCourses = await Course.find({ _id: { $in: user.enrolledCourses } }).lean();
    const teachingCourses = user.role === 'professor' ? await Course.find({ instructor: user._id }).lean() : [];

    const data = {
        profile: {
            name: user.name,
            email: user.email,
            role: user.role,
            bio: user.bio,
            location: user.location,
            website: user.website,
            createdAt: user.createdAt
        },
        courses: {
            enrolled: enrolledCourses,
            teaching: teachingCourses
        }
    };

    res.json(data);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ message: 'Error exporting data' });
  }
};

// @desc    Delete user profile (Self-delete) - DEPRECATED/BLOCKED
// @route   DELETE /api/users/profile
// @access  Private
const deleteUserProfile = async (req, res) => {
    res.status(403).json({ 
        message: 'A exclusão direta não é mais permitida. Por favor, solicite um código de exclusão na aba de Privacidade.',
        code: 'DEPRECATION_ERROR'
    });
};

// @desc    Delete user (Admin)
// @route   DELETE /api/users/:id
// @access  Private/Admin
const adminDeleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { hasDependencies, reasons } = await checkDependencies(user._id);

    if (hasDependencies) {
        return res.status(400).json({ 
            message: 'Não é possível excluir a conta pois existem interações registradas.',
            details: reasons,
            code: 'DEPENDENCIES_EXIST'
        });
    }
    
    await User.findByIdAndDelete(user._id);
    
    res.json({ message: 'User removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Request account deletion code
// @route   POST /api/users/request-deletion
// @access  Private
const requestDeletionCode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const deletionCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    const deletionCodeHash = crypto
      .createHash('sha256')
      .update(deletionCode)
      .digest('hex');

    user.deletionCode = deletionCodeHash;
    user.deletionCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    const message = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #e11d48;">Solicitação de Exclusão de Conta</h1>
        <p>Você solicitou a exclusão da sua conta no Ateliê Belnique.</p>
        <p>Para confirmar esta ação irreversível, use o código abaixo:</p>
        <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a;">${deletionCode}</span>
        </div>
        <p>Este código expira em 10 minutos.</p>
        <p style="color: #64748b; font-size: 14px;">Se você não solicitou a exclusão da sua conta, por favor ignore este email e altere sua senha imediatamente.</p>
      </div>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Código de Confirmação de Exclusão - Ateliê Belnique',
        message: `Seu código de exclusão é: ${deletionCode}`,
        html: message
      });

      res.status(200).json({ success: true, message: 'Código de verificação enviado para o seu email' });
    } catch (err) {
      user.deletionCode = undefined;
      user.deletionCodeExpires = undefined;
      await user.save();
      return res.status(500).json({ message: 'Erro ao enviar email' });
    }
  } catch (error) {
    console.error('Request deletion error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Confirm account deletion
// @route   POST /api/users/confirm-deletion
// @access  Private
const confirmDeletion = async (req, res) => {
  const { code } = req.body;

  if (!code) {
      return res.status(400).json({ message: 'Código é obrigatório' });
  }

  try {
    const deletionCodeHash = crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');

    const user = await User.findOne({
      _id: req.user._id,
      deletionCode: deletionCodeHash,
      deletionCodeExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Código inválido ou expirado' });
    }

    const { hasDependencies, reasons } = await checkDependencies(user._id);

    if (hasDependencies) {
      return res.status(400).json({ 
        message: 'Não é possível excluir a conta pois existem interações registradas.',
        details: reasons,
        code: 'DEPENDENCIES_EXIST'
      });
    }

    await User.findByIdAndDelete(user._id);

    logActivity({
       user: user._id, 
       action: 'USER_SELF_DELETE',
       details: `Usuário ${user.name} excluiu sua própria conta via código de verificação`,
       targetId: user._id
    });

    res.status(200).json({ success: true, message: 'Conta excluída com sucesso' });
  } catch (error) {
    console.error('Confirm deletion error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  authUser,
  authGoogle,
  registerUser,
  getUserProfile,
  updateUserProfile,
  updateUserPreferences,
  updateUserPreferences,
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
};
