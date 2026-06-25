const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a', index: true },
    name: { type: String, default: 'Người dùng' },
    
    // --- KINH TẾ 2.0 ---
    totalCoins: { type: Number, default: 0, index: true },
    diamonds: { type: Number, default: 0 },
    
    // --- HỆ THỐNG MÁY ĐÀO (MINING 6H) ---
    level: { type: Number, default: 1 },
    isMining: { type: Boolean, default: false },
    miningStartedAt: { type: Date, default: null },
    miningRate: { type: Number, default: 12.0 }, 

    // --- QUẢN LÝ ĐIỂM DANH CHUỖI 7 NGÀY (ĐỒNG BỘ MỚI) ---
    lastCheckinDate: { type: String, default: null, index: true },
    checkinStreak: { type: Number, default: 0 },

    // --- QUẢN LÝ QUẢNG CÁO & HOẠT ĐỘNG ---
    adsWatchedToday: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: new Date().toDateString() },

    // --- GIỚI THIỆU ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null, index: true } 
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
