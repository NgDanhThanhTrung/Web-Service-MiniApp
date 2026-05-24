const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, BOT_USERNAME, MONGODB_URI } = process.env;

// ==========================================
// 1. CẤU HÌNH QUY ƯỚC KINH TẾ & NÂNG CẤP
// ==========================================
const EXCHANGE_RATE = 20000;       
const XU_PER_DIAMOND_BUY = 2000;   
const XU_PER_DIAMOND_SELL = 1500;  
const UPGRADE_COST_DIAMOND = 100;  
const RATE_INCREASE_PER_LEVEL = 0.2; 
const MINING_SESSION_HOURS = 6; // Thời gian 1 phiên đào

// ==========================================
// 2. KẾT NỐI DATABASE MONGODB
// ==========================================
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Hệ thống đã kết nối Database MongoDB thành công'))
    .catch(err => console.error('❌ Lỗi kết nối Database:', err));

const User = require('./models/User');

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

// ==========================================
// 3. CẤU HÌNH MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 4. ĐIỀU HƯỚNG GIAO DIỆN (ROUTES)
// ==========================================
app.get(['/', '/app'], (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/config', (req, res) => {
    res.json({ 
        botUser: BOT_USERNAME || 'YourBotUsername',
        exchangeRate: EXCHANGE_RATE 
    });
});

// ==========================================
// 5. HỆ THỐNG QUẢNG CÁO - CẬP NHẬT CỘNG TIỀN REALTIME
// ==========================================
async function processAdReward(userId, type, amount) {
    if (!userId) return { ok: false, msg: 'Thiếu userId' };
    try {
        const user = await User.findOne({ telegramId: userId.toString() });
        if (!user) return { ok: false, msg: 'User không tồn tại' };

        const now = new Date();
        const today = now.toDateString();

        // Reset bộ đếm ngày mới
        if (user.lastActiveDay !== today) {
            user.dailyVideo = 0;
            user.dailyInterstitial = 0;
            user.dailyBanner = 0;
            user.adsWatchedToday = 0;
            user.lastActiveDay = today;
        }

        const limitKey = `daily${type.charAt(0).toUpperCase() + type.slice(1)}`;
        if (user[limitKey] >= 15) return { ok: false, msg: 'Hôm nay đã xem hết lượt!' };

        // CỘNG XU VÀO DATABASE
        user.totalCoins = (user.totalCoins || 0) + amount;
        user[limitKey] = (user[limitKey] || 0) + 1;
        user.adsWatchedToday = (user.adsWatchedToday || 0) + 1;

        await user.save();
        
        // Trả về dữ liệu chi tiết để Frontend cập nhật ngay lập tức
        return { 
            ok: true, 
            totalCoins: user.totalCoins, 
            diamonds: user.diamonds,
            adsWatchedToday: user.adsWatchedToday,
            reward: amount
        };
    } catch (e) { return { ok: false, msg: "Lỗi hệ thống" }; }
}

app.get('/api/ads-rewarded', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'video', 250000);
    res.json(result); // Trả về JSON thay vì text đơn thuần
});

app.get('/api/ads-interstitial', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'interstitial', 100000);
    res.json(result);
});

app.get('/api/ads-banner', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'banner', 25000);
    res.json(result);
});

// ==========================================
// 6. QUẢN LÝ NGƯỜI DÙNG & REALTIME
// ==========================================
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username } = req.body;
    if (!id) return res.status(400).send("Missing ID");
    try {
        let user = await User.findOne({ telegramId: id.toString() });
        const today = new Date().toDateString();

        if (!user) {
            user = new User({ 
                telegramId: id.toString(), name: first_name, username: username || 'n/a', 
                lastActiveDay: today, level: 1, totalCoins: 0, diamonds: 0, miningRate: 12.0
            });
            await user.save();
        } else if (user.lastActiveDay !== today) {
            user.adsWatchedToday = 0;
            user.dailyVideo = 0; user.dailyInterstitial = 0; user.dailyBanner = 0;
            user.lastActiveDay = today;
            await user.save();
        }

        res.json({
            ...user._doc,
            id: user.telegramId,
            coins: user.totalCoins,
            vndEstimate: Math.floor(user.totalCoins / EXCHANGE_RATE)
        });
    } catch (e) { res.status(500).json(e); }
});

// Thêm endpoint phụ để client polling (nếu cần)
app.post('/api/get-realtime-data', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.body.id.toString() });
        if (user) {
            res.json({ ok: true, totalCoins: user.totalCoins, diamonds: user.diamonds });
        } else res.json({ ok: false });
    } catch (e) { res.json({ ok: false }); }
});

// ==========================================
// 7. HỆ THỐNG KIM CƯƠNG & NÂNG CẤP
// ==========================================
app.post('/api/exchange-to-diamond', async (req, res) => {
    const { id, amountDiamond } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        const cost = parseInt(amountDiamond) * XU_PER_DIAMOND_BUY;
        if (user.totalCoins < cost) return res.json({ ok: false, msg: "Không đủ Xu!" });

        user.totalCoins -= cost;
        user.diamonds = (user.diamonds || 0) + parseInt(amountDiamond);
        await user.save();
        res.json({ ok: true, coins: user.totalCoins, diamonds: user.diamonds });
    } catch (e) { res.json({ ok: false }); }
});

app.post('/api/exchange-to-xu', async (req, res) => {
    const { id, amountDiamond } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (user.diamonds < amountDiamond) return res.json({ ok: false, msg: "Không đủ 💎" });

        user.diamonds -= parseInt(amountDiamond);
        user.totalCoins += (parseInt(amountDiamond) * XU_PER_DIAMOND_SELL);
        await user.save();
        res.json({ ok: true, coins: user.totalCoins, diamonds: user.diamonds });
    } catch (e) { res.json({ ok: false }); }
});

app.post('/api/upgrade', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if ((user.diamonds || 0) < UPGRADE_COST_DIAMOND) {
            return res.json({ ok: false, msg: `Cần ${UPGRADE_COST_DIAMOND} 💎 để nâng cấp!` });
        }

        user.diamonds -= UPGRADE_COST_DIAMOND;
        user.level += 1;
        user.miningRate = (user.miningRate || 12.0) + RATE_INCREASE_PER_LEVEL;

        let bonus = "";
        if ([10, 20, 30].includes(user.level)) {
            user.totalCoins += 250000;
            bonus = " + Thưởng 250k Xu!";
        }

        await user.save();
        res.json({ ok: true, level: user.level, miningRate: user.miningRate, msg: `Lên cấp ${user.level} thành công!${bonus}` });
    } catch (e) { res.json({ ok: false }); }
});

// ==========================================
// 8. LOGIC ĐÀO (MINING) - CẬP NHẬT TRỰC TIẾP
// ==========================================
app.post('/api/start-mining', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "User không tồn tại" });

        if (user.isMining && user.miningStartedAt) {
            const now = new Date();
            const diffMs = now - new Date(user.miningStartedAt);
            const diffHours = diffMs / (1000 * 60 * 60);
            
            if (diffHours < MINING_SESSION_HOURS) {
                return res.json({ ok: false, msg: "Máy đang hoạt động, vui lòng đợi hết phiên!" });
            }
        }

        const secondsInSession = MINING_SESSION_HOURS * 60 * 60; 
        const reward = Math.floor(user.miningRate * secondsInSession);

        user.totalCoins += reward;
        user.isMining = true;
        user.miningStartedAt = new Date();

        await user.save();

        res.json({ 
            ok: true, 
            msg: `Đã cộng +${reward.toLocaleString()} Xu!`,
            reward: reward,
            totalCoins: user.totalCoins,
            miningStartedAt: user.miningStartedAt
        });
    } catch (e) { res.json({ ok: false }); }
});

app.post('/api/mining-sync', (req, res) => res.json({ ok: true })); 

// ==========================================
// 9. RÚT TIỀN & ADMIN
// ==========================================
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if ((user.adsWatchedToday || 0) < 15) return res.json({ ok: false, msg: "Xem đủ 15 QC để rút" });
        if (user.totalCoins < amountXu || amountXu < 4000000) return res.json({ ok: false, msg: "Sai hạn mức hoặc thiếu tiền" });

        user.totalCoins -= amountXu;
        await user.save();
        await new Withdraw({ userId: id.toString(), name: user.name, amountXu, method, address }).save();
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    const users = await User.find().sort({ totalCoins: -1 }).limit(100);
    const withdraws = await Withdraw.find().sort({ createdAt: -1 });
    res.json({ users, withdraws });
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.json({ ok: false });
    await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Đã thanh toán' });
    res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Hệ thống vận hành tại cổng ${PORT}`));
