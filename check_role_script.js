const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

// Load env vars
dotenv.config();

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/belnique';
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

const checkUserRole = async () => {
  const email = 'fragmatec@gmail.com';
  
  try {
    await connectDB();

    const user = await User.findOne({ email });

    if (!user) {
      console.log(`User with email ${email} not found.`);
      process.exit(1);
    }

    console.log('------------------------------------------------');
    console.log(`User found: ${user.name} (${user.email})`);
    console.log(`Current Primary Role: ${user.role}`);
    console.log(`Secondary Roles: ${JSON.stringify(user.secondaryRoles)}`);
    console.log('------------------------------------------------');
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking user:', error);
    process.exit(1);
  }
};

checkUserRole();
