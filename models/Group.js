const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    _id: String,
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['public', 'private'], default: 'public' },
    password: { type: String, default: '' },
    avatarColor: { type: String, default: '#667eea' },
    avatarText: { type: String, default: '群' },
    members: { type: [String], default: [] },
    createdAt: { type: Number, default: Date.now }
});

groupSchema.index({ members: 1 });

module.exports = mongoose.model('Group', groupSchema);
