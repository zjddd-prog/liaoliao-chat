const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
    _id: { type: String, default: 'donation_config' },
    wechat: { type: String, default: '' },
    alipay: { type: String, default: '' }
});

module.exports = mongoose.model('Donation', donationSchema);
