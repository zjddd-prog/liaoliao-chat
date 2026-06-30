const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    id: String,
    userId: String,
    nickname: String,
    content: String,
    createdAt: Number
}, { _id: false });

const momentSchema = new mongoose.Schema({
    _id: String,
    userId: { type: String, required: true, index: true },
    content: { type: String, default: '' },
    images: { type: [String], default: [] },
    likes: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] },
    isPublic: { type: Boolean, default: true },
    createdAt: { type: Number, default: Date.now, index: true }
});

momentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Moment', momentSchema);
