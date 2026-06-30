const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    _id: String,
    userId: { type: String, required: true, index: true },
    nickname: String,
    avatarColor: String,
    avatarText: String,
    content: { type: String, required: true },
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    createdAt: { type: Number, default: Date.now, index: true }
});

feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
