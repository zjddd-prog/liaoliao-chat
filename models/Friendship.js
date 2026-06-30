const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
    _id: String,
    userId: { type: String, required: true, index: true },
    friendId: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'accepted' },
    createdAt: { type: Number, default: Date.now }
});

friendshipSchema.index({ userId: 1, friendId: 1 });

module.exports = mongoose.model('Friendship', friendshipSchema);
