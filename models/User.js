const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    
    // --- KINH TẾ CHỐNG LẠM PHÁT ---
    totalCoins: { type: Number, default: 0, min: 0 },
    diamonds: { type: Number, default: 0, min: 0 },
    
    // --- HỆ THỐNG MÁY ĐÀO (MINING TỐI ĐA 6H) ---
    level: { type: Number, default: 1, min: 1 },
    isMining: { type: Boolean, default: false },
    miningStartedAt: { type: Date, default: null },
    miningRate: { type: Number, default: 12.0 }, // Mặc định Level 1 = 12.0 Xu/giây

    // --- QUẢN LÝ QUẢNG CÁO & RESET TRONG NGÀY ---
    adsWatchedToday: { type: Number, default: 0, min: 0 },
    lastActiveDay: { type: String, default: new Date().toDateString() },

    // --- GIỚI THIỆU CHỐNG CLONE ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    referralRewardClaimed: { type: Boolean, default: false } // K khóa chống thưởng lặp
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
