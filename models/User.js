const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'n/a' },
    name: { type: String, default: 'Người dùng' },
    
    // --- HỆ THỐNG KINH TẾ (ĐÃ NHÂN 100) ---
    // Số dư XU: Hiển thị lớn để tạo hưng phấn (100.000.000 XU = 60.000 VNĐ)
    totalCoins: { type: Number, default: 0 },
    
    // Số dư Kim cương: Dùng để nâng cấp máy đào hoặc quy đổi ngược ra XU
    diamonds: { type: Number, default: 0 },
    
    // Cấp độ máy đào: Quyết định tốc độ đào XU tự động mỗi giây
    level: { type: Number, default: 1 },
    
    // --- QUẢN LÝ QUẢNG CÁO & ĐIỀU KIỆN RÚT TIỀN ---
    // Tổng số QC đã xem trong ngày (Cộng dồn từ Video + Interstitial + Banner)
    adsWatchedToday: { type: Number, default: 0 },
    
    dailyVideo: { type: Number, default: 0 },
    dailyInterstitial: { type: Number, default: 0 },
    dailyBanner: { type: Number, default: 0 },

    // Ngày hoạt động gần nhất để reset các chỉ số daily (Daily Reset)
    lastActiveDay: { type: String, default: new Date().toDateString() },

    // --- CHỐNG SPAM & GIỚI HẠN ---
    lastVideo: { type: Date },
    lastInterstitial: { type: Date },
    lastBanner: { type: Date },
    spinsLeft: { type: Number, default: 5 },

    // --- HỆ THỐNG GIỚI THIỆU ---
    refs: { type: Number, default: 0 },
    referredBy: { type: String, default: null } 
}, { timestamps: true });

/**
 * Ghi chú vận hành cho Nhà phát triển (Economy Logic):
 * * 1. KHAI THÁC TỰ ĐỘNG:
 * - Tốc độ Lvl 1: 2.0 XU/giây
 * - Mỗi cấp tăng thêm: +1.0 XU/giây
 * - Công thức: Speed = 2.0 + (level - 1) * 1.0
 * * 2. TỶ GIÁ HỐI ĐOÁI (Exchange - Chiết khấu 25%):
 * - Chiều MUA: 20,000 XU = 1 💎
 * - Chiều BÁN: 1 💎 = 15,000 XU
 * * 3. GIÁ TRỊ THỰC (Developer Profit):
 * - 100,000,000 XU = 60,000 VNĐ (Tỷ giá an toàn để trả thưởng từ Ads)
 * - 1 XU = 0.0006 VNĐ
 * * 4. LOGIC ADS:
 * - Mỗi khi xem thành công bất kỳ loại QC nào, cập nhật đồng thời:
 * user.daily[Loại_QC] += 1
 * user.adsWatchedToday = user.dailyVideo + user.dailyInterstitial + user.dailyBanner
 */

module.exports = mongoose.model('User', userSchema);
