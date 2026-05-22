const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    
    // --- HỆ THỐNG KINH TẾ (ĐÃ NHÂN 100 & TỈ GIÁ 2000:1) ---
    // Hiển thị lớn: 4.000.000 XU = 2.000 VNĐ | 100.000.000 XU = 50.000 VNĐ
    totalCoins: { type: Number, default: 0 },
    
    // Kim cương dùng để nâng cấp máy đào
    diamonds: { type: Number, default: 0 },
    
    // Cấp độ máy đào: Quyết định sản lượng nhận được sau mỗi 6 giờ
    level: { type: Number, default: 1 },
    
    // --- HỆ THỐNG MÁY ĐÀO TỰ ĐỘNG (6 TIẾNG/LẦN) ---
    isMining: { type: Boolean, default: false },
    miningStartedAt: { type: Date, default: null },

    // --- QUẢN LÝ QUẢNG CÁO & ĐIỀU KIỆN RÚT TIỀN ---
    // Tổng số QC trong ngày (Bắt buộc >= 15 để rút tiền)
    adsWatchedToday: { type: Number, default: 0 },
    
    dailyVideo: { type: Number, default: 0 },
    dailyInterstitial: { type: Number, default: 0 },
    dailyBanner: { type: Number, default: 0 },

    // Reset daily stats
    lastActiveDay: { type: String, default: new Date().toDateString() },

    // --- CHỐNG SPAM & COOLDOWN ---
    lastVideo: { type: Date },
    lastInterstitial: { type: Date },
    lastBanner: { type: Date },

    // --- HỆ THỐNG GIỚI THIỆU ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null } 
}, { timestamps: true });

/**
 * GHI CHÚ VẬN HÀNH CHO NHÀ PHÁT TRIỂN (Updated Economy 2.0):
 * * 1. KHAI THÁC TỰ ĐỘNG (MINING 6H):
 * - Sản lượng Lvl 1: 250,000 XU / 6 giờ.
 * - Mỗi cấp tăng thêm: +100,000 XU / 6 giờ.
 * - Thưởng cột mốc (Milestone): Khi user đạt Level 10, 20, 30 cộng ngay 250,000 XU.
 * * 2. TỶ GIÁ HỐI ĐOÁI (Exchange):
 * - Chiều MUA: 20,000 XU = 1 💎
 * - Chiều BÁN: 1 💎 = 15,000 XU
 * * 3. GIÁ TRỊ THỰC (Profit calculation):
 * - Tỉ giá quy đổi: 2,000 XU = 1 VNĐ.
 * - Min rút: 4,000,000 XU (= 2,000 VNĐ).
 * - Điều kiện rút: adsWatchedToday >= 15 (Để Admin có lãi từ Adsgram).
 * * 4. LOGIC QUẢNG CÁO (Đã giảm thưởng 4 lần):
 * - Video Rewarded: 250,000 XU (= 125 VNĐ)
 * - Interstitial: 100,000 XU (= 50 VNĐ)
 * - Banner: 25,000 XU (= 12.5 VNĐ)
 */

module.exports = mongoose.model('User', userSchema);
