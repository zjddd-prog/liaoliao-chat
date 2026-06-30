const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liaoliao-chat';

mongoose.set('strictQuery', false);

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('MongoDB connected successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        // Fallback: retry after 5 seconds
        console.log('Retrying in 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));
        return connectDB();
    }
}

module.exports = { connectDB, mongoose };
