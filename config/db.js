const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Be robust with env loading (cpanel working dir varies)
try { dotenv.config({ path: path.resolve(__dirname, '../../.env') }); } catch {}
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI;
    const isProd = (process.env.NODE_ENV || 'production').toLowerCase() === 'production';
    if (!uri) {
      if (isProd) {
        throw new Error('MONGO_URI not set in environment');
      } else {
        uri = 'mongodb://localhost:27017/belnique';
      }
    }

    const conn = await mongoose.connect(uri, {
      // Modern driver uses unified topology by default
      // Add conservative timeouts for shared hosting
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 10000,
      // Reduce DNS flakiness on some hosts by preferring IPv4 via NODE options in index.js
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Fail fast so upstream returns a clear 503/500 instead of hanging
    process.exit(1);
  }
};

module.exports = connectDB;
