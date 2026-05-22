const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    
    // --- KINH TẾ 2.0 ---
    totalCoins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    
    // --- HỆ THỐNG MÁY ĐÀO (MINING 6H) ---
    level: { type: Number, default: 1 },
    isMining: { type: Boolean, default: false },
    miningStartedAt: { type: Date, default: null },
    
    // TRƯỜNG MỚI: Tốc độ khai thác (Xu/giây)
    // Mặc định level 1 = 12.0 Xu/s
    miningRate: { type: Number, default: 12.0 }, 

    // --- QUẢN LÝ QUẢNG CÁO ---
    adsWatchedToday: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: new Date().toDateString() },

    // --- GIỚI THIỆU ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null } 
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
