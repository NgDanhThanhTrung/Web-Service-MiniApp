const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    totalCoins: { type: Number, default: 0 },
    spinsLeft: { type: Number, default: 5 },
    adsWatchedToday: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: new Date().toDateString() },
    refs: { type: Number, default: 0 }
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);
