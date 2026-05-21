const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    totalCoins: { type: Number, default: 0 },
    spinsLeft: { type: Number, default: 5 },
    
    // Tổng số quảng cáo đã xem trong ngày (dùng để check điều kiện rút tiền)
    adsWatchedToday: { type: Number, default: 0 },
    
    // Ngày hoạt động gần nhất để reset các chỉ số daily
    lastActiveDay: { type: String, default: new Date().toDateString() },
    
    // --- THEO DÕI GIỚI HẠN 10 LƯỢT/NGÀY ---
    dailyVideo: { type: Number, default: 0 },
    dailyInterstitial: { type: Number, default: 0 },
    dailyBanner: { type: Number, default: 0 },

    // --- THEO DÕI COOLDOWN (CHỐNG SPAM CLICK) ---
    lastVideo: { type: Date },
    lastInterstitial: { type: Date },
    lastBanner: { type: Date },

    // Hệ thống giới thiệu
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null } // Lưu ID người mời nếu cần
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
