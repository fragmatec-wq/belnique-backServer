const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Course = require('../models/Course');
const Event = require('../models/Event');
const Article = require('../models/Article');
const Activity = require('../models/Activity');
const logActivity = require('../utils/activityLogger');
const sendEmail = require('../utils/sendEmail');


const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Auth admin & get token
// @route   POST /api/admin/login
// @access  Public
const authAdmin = async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email });

  if (admin && (await admin.matchPassword(password))) {
    res.json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      token: generateToken(admin._id),
    });
  } else {
    res.status(401).json({ message: 'Invalid email or password' });
  }
};

const SystemSettings = require('../models/SystemSettings');

// @desc    Register a new admin
// @route   POST /api/admin
// @access  Public
const registerAdmin = async (req, res) => {
  const { 
    name, email, password, role,
    province, municipality, commune, address, referencePoint,
    taxpayerType, nif,
    idDocumentType, idDocumentNumber, idDocumentExpirationDate,
    mobilePrimary, mobileSecondary,
    registrationKey, superAdminKey
  } = req.body;

  // Validate Email Domain
  if (!email || !email.endsWith('@ateliebelnique.com')) {
    res.status(400).json({ message: 'O email deve ser corporativo (@ateliebelnique.com)' });
    return;
  }

  // Verify Registration Key
  const settings = await SystemSettings.getInstance();
  if (settings.adminRegistrationKey !== registrationKey) {
    res.status(401).json({ message: 'Invalid registration key' });
    return;
  }

  const adminExists = await Admin.findOne({ email });

  if (adminExists) {
    res.status(400).json({ message: 'Admin already exists' });
    return;
  }

  // Validate role
  if (role && !['administrator1', 'Superadministrator2'].includes(role)) {
     res.status(400).json({ message: 'Invalid role' });
     return;
  }

  // Verify Super Admin Security Key
  if (role === 'Superadministrator2') {
    if (settings.superAdminSecurityKey !== superAdminKey) {
      res.status(401).json({ message: 'Chave de segurança de Super Administrador inválida' });
      return;
    }
  }

  // Handle documents
  const documentPaths = req.files ? req.files.map(file => file.path) : [];

  // Construct ID Document object
  const idDocument = {
    type: idDocumentType,
    number: idDocumentNumber,
    expirationDate: idDocumentExpirationDate
  };

  const admin = await Admin.create({
    name,
    email,
    password,
    role: role || 'administrator1',
    province,
    municipality,
    commune,
    address,
    referencePoint,
    taxpayerType,
    nif,
    idDocument,
    mobilePrimary,
    mobileSecondary,
    status: 'Pending', // Default status
    documents: documentPaths
  });

  if (admin) {
    res.status(201).json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      token: generateToken(admin._id),
    });
  } else {
    res.status(400).json({ message: 'Invalid admin data' });
  }
};

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private
const getAdminProfile = async (req, res) => {
  const admin = await Admin.findById(req.admin._id);

  if (admin) {
    res.json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    });
  } else {
    res.status(404).json({ message: 'Admin not found' });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments();
    const totalEvents = await Event.countDocuments();
    const totalArticles = await Article.countDocuments();
    
    // Get new users in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    res.json({
      users: totalUsers,
      courses: totalCourses,
      events: totalEvents,
      articles: totalArticles,
      newUsers
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      await user.deleteOne();
      
      await logActivity({
        admin: req.user ? req.user._id : undefined,
        action: 'USER_DELETE',
        details: `User deleted by admin: ${user.name} (${user.email})`,
        targetId: user._id
      });

      res.json({ message: 'User removed' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
};

// @desc    Create a new user (admin only)
// @route   POST /api/admin/users
// @access  Private
const createUser = async (req, res) => {
  const { 
    name, 
    email, 
    password, 
    role,
    phone,
    gender,
    documentType,
    documentNumber,
    address,
    professorType,
    dateOfBirth
  } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    // Check if document number already exists - Pra vc que ver todo o eu código, não gosto de comentar em português
    if (documentNumber) {
      const documentExists = await User.findOne({ documentNumber }); 
      if (documentExists) {
        res.status(400).json({ message: 'Já existe um usuário com este número de documento.' });
        return;
      }
    }

    // Generate random password if not provided
    const finalPassword = password || crypto.randomBytes(8).toString('hex');
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');

    const user = await User.create({
      name,
      email,
      password: finalPassword,
      role: role || 'student',
      phone,
      gender,
      birthDate: dateOfBirth,
      documentType,
      documentNumber,
      address,
      professorType: role === 'professor' ? (professorType || 'normal') : undefined,
      verificationToken,
      isVerified: false
    });

    if (user) {
      // Send verification email
      const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
      
      try {
        await sendEmail({
          email: user.email,
          subject: 'Verifique seu email - Ateliê Belnique',
          message: `Sua conta foi criada. Por favor, verifique seu email clicando no link: ${verificationUrl}`,
          html: `
            <h1>Bem-vindo(a) à Ateliê Belnique!</h1>
            <p>Sua conta foi criada com sucesso.</p>
            <p>Por favor, verifique seu email clicando no botão abaixo para ativar sua conta:</p>
            <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verificar Email</a>
            <p>Ou copie e cole este link no seu navegador:</p>
            <p>${verificationUrl}</p>
          `
        });
      } catch (emailError) {
        console.error('Erro ao enviar email de verificação:', emailError);
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tempPassword: !password ? finalPassword : undefined // Return password only if generated
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
};

// @desc    Get single user details
// @route   GET /api/admin/users/:id
// @access  Private
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user' });
  }
};

// @desc    Toggle block/unblock user
// @route   PUT /api/admin/users/:id/block
// @access  Private
const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isBlocked = !user.isBlocked;
    await user.save();
    
    await logActivity({
      admin: req.user ? req.user._id : undefined,
      action: user.isBlocked ? 'USER_BLOCK' : 'USER_UNBLOCK',
      details: `User ${user.isBlocked ? 'blocked' : 'unblocked'} by admin: ${user.name}`,
      targetId: user._id
    });

    res.json({ _id: user._id, isBlocked: user.isBlocked });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user status' });
  }
};

// @desc    Get system activities
// @route   GET /api/admin/activities
// @access  Private
const getActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const activities = await Activity.find()
      .populate('user', 'name email profileImage')
      .populate('admin', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Activity.countDocuments();

    res.json({
      activities,
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset password for a professor and return the new temp password
// @route   POST /api/admin/users/:id/reset-password
// @access  Private
const resetProfessorPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'professor') return res.status(400).json({ message: 'Apenas professores podem ter senha redefinida por esta ação' });

    const tempPassword = crypto.randomBytes(8).toString('hex');
    user.password = tempPassword;
    await user.save();

    await logActivity({
        admin: req.user ? req.user._id : undefined,
        action: 'PROFESSOR_PASSWORD_RESET',
        details: `Professor password reset by admin: ${user.name}`,
        targetId: user._id
    });

    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, tempPassword });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password' });
  }
};

// @desc    Upload hero image
// @route   POST /api/admin/upload-hero
// @access  Private
const uploadHeroImage = (req, res) => {
  if (req.file) {
    res.json({ message: 'Hero image uploaded successfully', path: '/src/assets/hero-art.jpg' });
  } else {
    res.status(400).json({ message: 'No file uploaded' });
  }
};

// @desc    Get all admins
// @route   GET /api/admin/admins
// @access  Private (SuperAdmin)
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({}).select('-password').sort({ createdAt: -1 });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admins' });
  }
};

// @desc    Delete admin
// @route   DELETE /api/admin/admins/:id
// @access  Private (SuperAdmin)
const deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    // Prevent deleting self
    if (admin._id.toString() === req.admin._id.toString()) {
        return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    await admin.deleteOne();
    res.json({ message: 'Admin removed' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting admin' });
  }
};

// @desc    Update admin status
// @route   PUT /api/admin/admins/:id/status
// @access  Private (SuperAdmin)
const updateAdminStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const admin = await Admin.findById(req.params.id);
        
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        if (admin._id.toString() === req.admin._id.toString()) {
            return res.status(400).json({ message: 'Cannot update your own status' });
        }

        admin.status = status;
        await admin.save();
        res.json(admin);
    } catch (error) {
        res.status(500).json({ message: 'Error updating admin status' });
    }
};

// @desc    Reset admin password
// @route   POST /api/admin/admins/:id/reset-password
// @access  Private (SuperAdmin)
const resetAdminPassword = async (req, res) => {
    try {
        const adminToReset = await Admin.findById(req.params.id);
        
        if (!adminToReset) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        if (adminToReset._id.toString() === req.admin._id.toString()) {
            return res.status(400).json({ message: 'Cannot reset your own password here' });
        }

        const tempPassword = crypto.randomBytes(8).toString('hex');
        adminToReset.password = tempPassword;
        await adminToReset.save();

        res.json({ 
            message: 'Password reset successfully', 
            tempPassword 
        });
    } catch (error) {
        res.status(500).json({ message: 'Error resetting admin password' });
    }
};

// @desc    Promote user (add secondary role)
// @route   PUT /api/admin/users/:id/promote
// @access  Private (Admin)
const promoteUser = async (req, res) => {
  const { role, professorType } = req.body;
  
  try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // If user already has this role as primary
      if (user.role === role) {
          return res.status(400).json({ message: 'Usuário já possui esta função como principal.' });
      }

      // Prepare update operations
      const updateOps = {
          $addToSet: { secondaryRoles: role }
      };

      // If promoting to professor, ensure professor specific fields are initialized
      if (role === 'professor') {
          if (professorType) {
               updateOps.professorType = professorType;
          } else if (!user.professorType) {
               updateOps.professorType = 'normal';
          }
      }

      // Use findByIdAndUpdate for atomic operation
      const updatedUser = await User.findByIdAndUpdate(
          req.params.id,
          updateOps,
          { new: true }
      );

      await logActivity({
        admin: req.user ? req.user._id : undefined,
        action: 'USER_PROMOTED',
        details: `Usuário ${user.name} promovido para ${role}`,
        targetId: user._id
      });

      res.json(updatedUser);
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};

// @desc    Demote user (remove professor role)
// @route   PUT /api/admin/users/:id/demote
// @access  Private (Admin)
const demoteUser = async (req, res) => {
  try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.role !== 'professor' && !user.secondaryRoles?.includes('professor')) {
          return res.status(400).json({ message: 'Usuário não é um professor.' });
      }

      const updateOps = {};

      // Remove professor from secondary roles
      updateOps.$pull = { secondaryRoles: 'professor' };

      // If currently primary role is professor, switch to new role
      if (user.role === 'professor') {
          // Determine new primary role
          let newRole = 'student';
          if (user.secondaryRoles && user.secondaryRoles.length > 0) {
              // Prefer 'student' or 'collector' if available in secondary roles
              const fallbackRole = user.secondaryRoles.find(r => r !== 'professor');
              if (fallbackRole) {
                  newRole = fallbackRole;
              }
          }
          updateOps.role = newRole;
          // Also make sure we pull the new primary role from secondary roles if it was there
          // But $pull only takes one value for field usually, unless using $in
          // Let's use $pullAll if we need to remove multiple
          // Or just let it be, having primary role in secondary list is redundant but not fatal.
          // However, let's keep it clean.
          // updateOps.$pull = { secondaryRoles: { $in: ['professor', newRole] } }; 
          // $pull with query syntax
      }

      const updatedUser = await User.findByIdAndUpdate(
          req.params.id,
          updateOps,
          { new: true }
      );

      await logActivity({
        admin: req.user ? req.user._id : undefined,
        action: 'USER_DEMOTED',
        details: `Usuário ${user.name} removido da função de Professor`,
        targetId: user._id
      });

      res.json(updatedUser);
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};

// @desc    Test email configuration
// @route   POST /api/admin/test-email
// @access  Private/Admin
const testEmailConfig = async (req, res) => {
  const { email } = req.body;
  // Use provided email, or admin email, or fallback to SMTP email
  const targetEmail = email || (req.user && req.user.email) || process.env.SMTP_EMAIL;

  try {
    const info = await sendEmail({
      email: targetEmail,
      subject: 'Teste de Configuração de Email - Ateliê Belnique',
      message: 'Se você recebeu este email, a configuração SMTP está funcionando corretamente.',
      html: `
        <h1>Teste Bem-sucedido</h1>
        <p>A configuração de email do servidor está funcionando.</p>
        <p><strong>Enviado em:</strong> ${new Date().toLocaleString()}</p>
        <hr>
        <h3>Detalhes da Configuração (Debug):</h3>
        <ul>
            <li><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</li>
            <li><strong>SMTP Port:</strong> ${process.env.SMTP_PORT}</li>
            <li><strong>SMTP User:</strong> ${process.env.SMTP_EMAIL}</li>
        </ul>
      `
    });

    res.json({ 
      message: 'Email enviado com sucesso', 
      info: {
        messageId: info.messageId,
        response: info.response
      },
      debug: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_EMAIL
      }
    });
  } catch (error) {
    console.error('Erro no teste de email:', error);
    res.status(500).json({ 
      message: 'Falha ao enviar email', 
      error: error.message,
      code: error.code,
      command: error.command,
      debug: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_EMAIL
      }
    });
  }
};

module.exports = {
  authAdmin,
  registerAdmin,
  getAdminProfile,
  getDashboardStats,
  getAllUsers,
  deleteUser,
  createUser,
  getActivities,
  getUserById,
  toggleBlockUser,
  resetProfessorPassword,
  uploadHeroImage,
  promoteUser,
  demoteUser,
  testEmailConfig,
  getAllAdmins,
  deleteAdmin,
  updateAdminStatus,
  resetAdminPassword
};
