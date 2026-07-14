const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const { ADMIN_PASS, MONGODB_URI } = process.env;

// Quy ước toán học Tokenomics bảo mật nghiêm ngặt
const EXCHANGE_RATE = 20000;       
const XU_PER_DIAMOND_BUY = 2000;   
const XU_PER_DIAMOND_SELL = 1500;  // Spread chênh lệch 25% để đốt xu
const REWARD_PER_AD = 400000;      // 1 Lượt xem = 400,000 Xu (~20 VNĐ, bảo vệ >50% biên lợi nhuận)
const MAX_MINING_SECONDS = 21600;  // Giới hạn cứng 1 phiên đào tối đa 6 tiếng
const REFERRAL_REWARD_XU = 1000000; // Thưởng 1,000,000 xu giải ngân gián tiếp chống clone

// Kết nối database
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Hệ thống đã kết nối Database MongoDB thành công'))
    .catch(err => console.error('❌ Lỗi kết nối Database:', err));

const User = require('./models/User');

// Khởi tạo Schema Quản lý Rút tiền khớp hoàn toàn dữ liệu lưu trữ cấu trúc cũ
const WithdrawSchema = new mongoose.Schema({
    userId: String,
    name: String,
    amountXu: Number,
    method: String,
    address: String,
    status: { type: String, default: 'Chờ duyệt' },
    createdAt: { type: Date, default: Date.now }
});
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

// Hàm tính toán sản lượng thu hoạch thời gian thực an toàn phía server
function calculateCurrentHarvest(user) {
    if (!user.isMining || !user.miningStartedAt) {
        return { earnedCoins: 0, elapsedSeconds: 0 };
    }
    const now = new Date();
    const startTime = new Date(user.miningStartedAt);
    let elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    
    if (elapsedSeconds < 0) elapsedSeconds = 0;
    
    // Thuật toán khóa chặn chống hack thời gian: Nếu vượt quá 6 tiếng, chỉ tính tròn 6 tiếng (21600s)
    if (elapsedSeconds > MAX_MINING_SECONDS) {
        elapsedSeconds = MAX_MINING_SECONDS;
    }
    
    const earnedCoins = Math.floor(elapsedSeconds * user.miningRate);
    return { earnedCoins, elapsedSeconds };
}

// Helper kiểm tra reset ngày mới hằng ngày của API
async function checkAndResetDailyStats(user) {
    const todayStr = new Date().toDateString();
    if (user.lastActiveDay !== todayStr) {
        user.adsWatchedToday = 0;
        user.lastActiveDay = todayStr;
    }
}

// ==========================================
// API: LẤY THÔNG TIN PROFILE USER TRONG GAME
// ==========================================
app.post('/api/user-data', async (req, res) => {
    const { id, username, name } = req.body;
    if (!id) return res.status(400).json({ ok: false, msg: "Thiếu ID người dùng" });

    try {
        let user = await User.findOne({ telegramId: id.toString() });
        if (!user) {
            // Trường hợp user bật thẳng WebApp, tự động đồng bộ khởi tạo
            user = new User({
                telegramId: id.toString(),
                username: username || 'n/a',
                name: name || 'Người dùng'
            });
            await user.save();
        }

        await checkAndResetDailyStats(user);
        await user.save();

        const { earnedCoins } = calculateCurrentHarvest(user);

        res.json({
            ok: true,
            user: {
                ...user.toObject(),
                pendingCoins: earnedCoins
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, msg: "Lỗi máy chủ tải profile" });
    }
});

// ==========================================
// API: KÍCH HOẠT MÁY ĐÀO (START MINING)
// ==========================================
app.post('/api/start-mining', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Người dùng không tồn tại" });
        if (user.isMining) return res.json({ ok: false, msg: "Máy đào đang hoạt động sẵn" });

        user.isMining = true;
        user.miningStartedAt = new Date();
        await user.save();

        res.json({ ok: true, msg: "Bắt đầu đào thành công!" });
    } catch (e) {
        res.json({ ok: false, msg: "Lỗi kích hoạt máy đào" });
    }
});

// ==========================================
// API 1/3: THU HOẠCH SẢN LƯỢNG MÁY ĐÀO (/api/harvest)
// ==========================================
app.post('/api/harvest', async (req, res) => {
    const { id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const user = await User.findOne({ telegramId: id.toString() }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Người dùng không tồn tại" });
        }
        if (!user.isMining) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Máy khai thác chưa được khởi động" });
        }

        const { earnedCoins, elapsedSeconds } = calculateCurrentHarvest(user);
        if (elapsedSeconds < 5) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Tần suất thu hoạch quá nhanh! Tối thiểu là cách 5 giây." });
        }

        // Thực hiện cộng dồn tiền tài sản chính và đóng phiên
        user.totalCoins += earnedCoins;
        user.isMining = false;
        user.miningStartedAt = null;

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.json({ ok: true, msg: `Đã thu hoạch thành công +${earnedCoins.toLocaleString()} Xu vào tài khoản.` });
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        res.json({ ok: false, msg: "Lỗi trong quá trình xử lý thu hoạch" });
    }
});

// ==========================================
// API ĐỔI KIM CƯƠNG (SỬ DỤNG SPREAD CHÊNH LỆCH ĐỂ ĐỐT XU TRÁNH LẠM PHÁT)
// ==========================================
app.post('/api/exchange-diamonds', async (req, res) => {
    const { id, type, amount } = req.body; // type: 'buy' hoặc 'sell'
    const qty = parseInt(amount, 10);
    if (isNaN(qty) || qty <= 0) return res.json({ ok: false, msg: "Số lượng không hợp lệ" });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findOne({ telegramId: id.toString() }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Không tìm thấy tài khoản" });
        }

        if (type === 'buy') {
            const cost = qty * XU_PER_DIAMOND_BUY;
            if (user.totalCoins < cost) {
                await session.abortTransaction();
                return res.json({ ok: false, msg: `Thiếu Xu Thường! Cần ${cost.toLocaleString()} Xu.` });
            }
            user.totalCoins -= cost;
            user.diamonds += qty;
        } else if (type === 'sell') {
            if (user.diamonds < qty) {
                await session.abortTransaction();
                return res.json({ ok: false, msg: "Không đủ số Kim cương hiện có để bán." });
            }
            const revenue = qty * XU_PER_DIAMOND_SELL;
            user.diamonds -= qty;
            user.totalCoins += revenue; // 25% biến mất vĩnh viễn khỏi lưu thông hệ thống
        } else {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Phương thức quy đổi sai cấu hình." });
        }

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();
        res.json({ ok: true, msg: "Giao dịch quy đổi tài sản hoàn tất!" });
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        res.json({ ok: false, msg: "Lỗi hoán đổi tài sản hoán vị." });
    }
});

// ==========================================
// API 2/3: NÂNG CẤP MÁY ĐÀO LŨY TIẾN VÀ HIỆU SUẤT GIẢM DẦN (/api/upgrade)
// ==========================================
app.post('/api/upgrade', async (req, res) => {
    const { id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findOne({ telegramId: id.toString() }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Người dùng không tồn tại" });
        }

        // Tự động thu hoạch phần xu tích lũy của phiên hiện tại trước khi nâng cấp
        if (user.isMining) {
            const { earnedCoins } = calculateCurrentHarvest(user);
            user.totalCoins += earnedCoins;
            user.isMining = false;
            user.miningStartedAt = null;
        }

        const currentLevel = user.level;
        // Công thức tính chi phí nâng cấp mỏ lũy tiến bằng Kim Cương: Cost = 100 * (Level ^ 1.8)
        const requiredDiamonds = Math.floor(100 * Math.pow(currentLevel, 1.8));

        if (user.diamonds < requiredDiamonds) {
            await session.abortTransaction();
            return res.json({ 
                ok: false, 
                msg: `Không đủ Kim Cương! Yêu cầu cấp độ này cần: ${requiredDiamonds} Kim cương. Hiện tại có: ${user.diamonds}` 
            });
        }

        // Thu hồi kim cương nâng cấp máy đào
        user.diamonds -= requiredDiamonds;
        user.level += 1;

        // Áp dụng thuật toán Diminishing Returns (Hiệu suất giảm dần tránh lạm phát cung tiền mỏ):
        // Rate mới = 12.0 + (12.0 * Level ^ 0.6)
        const baseRate = 12.0;
        user.miningRate = baseRate + parseFloat((baseRate * Math.pow(user.level, 0.6)).toFixed(4));

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.json({ ok: true, msg: `Chúc mừng! Thiết bị khai thác đã đạt cấp độ ${user.level}` });
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        res.json({ ok: false, msg: "Gặp sự cố lỗi trong tiến trình nâng cấp máy mỏ" });
    }
});

// ==========================================
// API THƯỞNG XEM ADSGRAM & GIẢI NGÂN GIỚI THIỆU GIÁN TIẾP CHỐNG CLONE
// ==========================================
app.post('/api/ads-reward', async (req, res) => {
    const { id } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findOne({ telegramId: id.toString() }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Không tìm thấy người dùng" });
        }

        await checkAndResetDailyStats(user);

        // Cộng phần thưởng cứng xem quảng cáo thông thường cho người chơi
        user.totalCoins += REWARD_PER_AD;
        user.adsWatchedToday += 1;

        // 🎯 THUẬT TOÁN THƯỞNG REFERRAL CHỐNG NICK ẢO:
        // Nếu người chơi có tuyến trên giới thiệu và chưa từng kích hoạt nhận thưởng Ref
        if (user.referredBy && !user.referralRewardClaimed) {
            // Điều kiện kích hoạt: Tài khoản cấp dưới được giới thiệu (B) phải cày xem đủ 15 ads đầu tiên
            if (user.adsWatchedToday >= 15) {
                const referrer = await User.findOne({ telegramId: user.referredBy }).session(session);
                if (referrer) {
                    referrer.totalCoins += REFERRAL_REWARD_XU;
                    referrer.refs += 1;
                    await referrer.save({ session });
                }
                user.referralRewardClaimed = true; // Chốt cờ trạng thái giải ngân duy nhất 1 lần
            }
        }

        await user.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.json({ ok: true, msg: `Cộng thưởng hoàn tất +${REWARD_PER_AD.toLocaleString()} Xu.` });
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        res.json({ ok: false, msg: "Lỗi ghi nhận phần thưởng xem quảng cáo" });
    }
});

// ==========================================
// API 3/3: RÚT TIỀN TIÊU HỦY THUẾ 10% BỀ NỔI (/api/withdraw)
// ==========================================
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    const withdrawAmount = parseInt(amountXu, 10);
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const user = await User.findOne({ telegramId: id.toString() }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Người dùng không tồn tại" });
        }

        await checkAndResetDailyStats(user);

        // Khóa chặn 1: Bắt buộc số lượng xem quảng cáo trong ngày adsWatchedToday >= 15 lượt
        if (user.adsWatchedToday < 15) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: `Yêu cầu xem tối thiểu đủ 15 video quảng cáo trong ngày để kích hoạt lệnh rút. (${user.adsWatchedToday}/15)` });
        }

        // Khóa chặn 2: Kiểm tra số dư tài sản và hạn mức rút tối thiểu 4,000,000 Xu Thường
        if (isNaN(withdrawAmount) || withdrawAmount < 4000000) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Hạn mức yêu cầu rút tiền tối thiểu phải từ 4,000,000 Xu Thường (~200 VNĐ)." });
        }

        if (user.totalCoins < withdrawAmount) {
            await session.abortTransaction();
            return res.json({ ok: false, msg: "Số dư ví tài khoản không đủ tiền thực hiện lệnh giao dịch này." });
        }

        // Thực hiện trừ tiền trực tiếp trên tài khoản user
        user.totalCoins -= withdrawAmount;
        await user.save({ session });

        // Khấu trừ thêm 10% phí rút tiền bề nổi hệ thống để tiêu hủy hoàn toàn (Burn) khỏi lưu thông game:
        // Số xu thực sự đẩy vào hàng đợi duyệt chuyển đi chỉ là 90% lượng yêu cầu rút ban đầu
        const burnTaxAmount = Math.floor(withdrawAmount * 0.10);
        const netPayoutAmount = withdrawAmount - burnTaxAmount;

        // Lưu đơn hàng khớp dữ liệu cấu trúc cũ vào collection Withdraw phục vụ cho trang quản lý admin duyệt tiền mặt
        await new Withdraw({ 
            userId: id.toString(), 
            name: user.name, 
            amountXu: netPayoutAmount, // Lưu trữ số tiền sau thuế thực chi cho user
            method, 
            address 
        }).save({ session });

        await session.commitTransaction();
        session.endSession();
        
        res.json({ ok: true, msg: `Gửi yêu cầu rút thành công! 10% thuế (${burnTaxAmount.toLocaleString()} xu) đã bị tiêu hủy hoàn toàn để duy trì nền kinh tế.` });
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        res.json({ ok: false, msg: "Hệ thống trục trặc khi tạo lệnh rút tiền" });
    }
});

// ==========================================
// API DASHBOARD PANEL ADMIN CONTROL
// ==========================================
app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    const users = await User.find().sort({ totalCoins: -1 }).limit(100);
    const withdraws = await Withdraw.find().sort({ createdAt: -1 });
    res.json({ users, withdraws });
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    const { id, pass } = req.body;
    if (pass !== ADMIN_PASS) return res.json({ ok: false, msg: "Sai mật khẩu admin" });
    
    try {
        const order = await Withdraw.findById(id);
        if (!order) return res.json({ ok: false, msg: "Đơn hàng rút không tìm thấy" });
        
        order.status = "Đã duyệt";
        await order.save();
        res.json({ ok: true });
    } catch (e) {
        res.json({ ok: false, msg: "Lỗi thực thi lệnh duyệt tiền" });
    }
});

// Phục vụ giao diện tĩnh Frontend và đồng bộ hóa Route của Single Page Application
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Web-Service Web-App Server running on port ${PORT}`));
