const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    _id: String,
    type: { type: String, enum: ['private', 'group'], required: true },
    from: { type: String, required: true, index: true },
    to: { type: String, required: true, index: true },
    content: { type: String, default: '' },
    messageType: { type: String, enum: ['text', 'image'], default: 'text' },
    timestamp: { type: Number, default: Date.now, index: true },
    read: { type: Boolean, default: false },
    readBy: { type: [String], default: [] }
});

// Compound indexes for chat history queries
messageSchema.index({ type: 1, from: 1, to: 1 });
messageSchema.index({ type: 1, to: 1, from: 1 });

module.exports = mongoose.model('Message', messageSchema);
