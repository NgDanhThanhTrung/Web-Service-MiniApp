const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    
    // --- KINH TẾ 2.0 ---
    totalCoins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    
    // --- HỆ THỐNG MÁY ĐÀO ---
    level: { type: Number, default: 1 },
    isMining: { type: Boolean, default: false },
    miningStartedAt: { type: Date, default: null },
    miningRate: { type: Number, default: 12.0 }, 

    // --- QUẢN LÝ QUẢNG CÁO & HOẠT ĐỘNG ---
    adsWatchedToday: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: new Date().toDateString() },
    dailyVideo: { type: Number, default: 0 },
    dailyInterstitial: { type: Number, default: 0 },
    dailyBanner: { type: Number, default: 0 },
    
    // --- ĐIỂM DANH ---
    dailyCheckin: {
        lastCheckinDay: { type: String, default: "" },
        streak: { type: Number, default: 0 }
    },

    // --- GIỚI THIỆU ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null } 
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
