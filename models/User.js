const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: String,
    username: { type: String, required: true, unique: true, minlength: 2, maxlength: 20 },
    password: { type: String, required: true },
    nickname: { type: String, default: '' },
    bio: { type: String, default: '' },
    avatarColor: { type: String, default: '#667eea' },
    avatarText: { type: String, default: '?' },
    avatarUrl: { type: String, default: null },
    role: { type: String, enum: ['user', 'admin', 'super_admin', 'system'], default: 'user' },
    points: { type: Number, default: 0 },
    lastCheckinDate: { type: String, default: null },
    bubbleStyle: { type: Number, default: 0 },
    bubblePurchases: { type: mongoose.Schema.Types.Mixed, default: {} },
    blockedUsers: { type: [String], default: [] },
    banned: { type: Boolean, default: false },
    createdAt: { type: Number, default: Date.now }
});

// Strip password when converting to JSON
userSchema.methods.toSafeJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.__v;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
