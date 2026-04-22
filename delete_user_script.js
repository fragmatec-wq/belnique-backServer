console.log("SCRIPT STARTING...");
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars from root or server directory
const rootEnvPath = path.resolve(__dirname, '../.env');
const serverEnvPath = path.resolve(__dirname, '.env');

console.log(`Looking for .env at: ${rootEnvPath}`);
dotenv.config({ path: rootEnvPath });

if (!process.env.MONGO_URI) {
    console.log(`MONGO_URI not found in root .env, checking server .env: ${serverEnvPath}`);
    dotenv.config({ path: serverEnvPath });
}

const User = require('./models/User');

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI; 
    console.log(`Connecting to MongoDB... (URI length: ${uri ? uri.length : 0})`);
    
    if (!uri) {
        throw new Error("MONGO_URI is missing!");
    }

    await mongoose.connect(uri);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

const deleteUser = async () => {
  const email = process.argv[2] || 'franciscofelicidade62@gmail.com';
  
  try {
    await connectDB();

    console.log(`Searching for user with email: ${email}`);
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`User with email ${email} not found.`);
      process.exit(0); // Exit success even if not found, task is "ensure deleted"
    }

    console.log(`User found: ${user.name} (ID: ${user._id})`);
    
    const result = await User.deleteOne({ _id: user._id });
    
    if (result.deletedCount === 1) {
        console.log(`Successfully deleted user: ${email}`);
    } else {
        console.log('Failed to delete user.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error deleting user:', error);
    process.exit(1);
  }
};

deleteUser();
