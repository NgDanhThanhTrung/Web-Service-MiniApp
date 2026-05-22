const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    
    // Số dư XU (Đã nhân 100 để tạo cảm giác hưng phấn)
    totalCoins: { type: Number, default: 0 },
    
    // Số dư Kim cương (Dùng để nâng cấp hoặc quy đổi ngược)
    diamonds: { type: Number, default: 0 },
    
    // Cấp độ máy đào (Mỗi cấp tăng tốc độ đào +1.0 XU/s)
    level: { type: Number, default: 1 },
    
    spinsLeft: { type: Number, default: 5 },
    
    // Tổng số quảng cáo đã xem trong ngày (dùng để check điều kiện rút tiền)
    adsWatchedToday: { type: Number, default: 0 },
    
    // Ngày hoạt động gần nhất để reset các chỉ số daily
    lastActiveDay: { type: String, default: new Date().toDateString() },
    
    // --- THEO DÕI GIỚI HẠN LƯỢT XEM/NGÀY ---
    dailyVideo: { type: Number, default: 0 },
    dailyInterstitial: { type: Number, default: 0 },
    dailyBanner: { type: Number, default: 0 },

    // --- THEO DÕI COOLDOWN (CHỐNG SPAM CLICK) ---
    lastVideo: { type: Date },
    lastInterstitial: { type: Date },
    lastBanner: { type: Date },

    // --- HỆ THỐNG GIỚI THIỆU ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null } 
}, { timestamps: true });

// Lưu ý cho Nhà phát triển:
// 1. Tốc độ đào mặc định (Lvl 1): 2.0 XU/s
// 2. Mỗi cấp tăng thêm: +1.0 XU/s
// 3. Tỷ giá quy đổi an toàn: 100.000.000 XU = 60.000 VNĐ
// 4. Chiết khấu hối đoái: Mua 💎 = 20k XU | Bán 💎 = 15k XU

module.exports = mongoose.model('User', userSchema);
