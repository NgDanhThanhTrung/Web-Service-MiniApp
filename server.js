const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, BOT_USERNAME, MONGODB_URI } = process.env;

// ==========================================
// 1. CẤU HÌNH QUY ƯỚC KINH TẾ & NÂNG CẤP
// ==========================================
const EXCHANGE_RATE = 20000;       // 20,000 Xu = 1 VNĐ
const XU_PER_DIAMOND_BUY = 2000;   // 2,000 Xu đổi được 1 💎
const XU_PER_DIAMOND_SELL = 1500;  // 1 💎 đổi lại được 1,500 Xu
const UPGRADE_COST_DIAMOND = 100;  // Phí cố định 100 💎 mỗi lần lên cấp
const RATE_INCREASE_PER_LEVEL = 0.2; // Tăng 1 cấp tốc độ tăng thêm 0.2 xu/s

// ==========================================
// 2. KẾT NỐI DATABASE MONGODB
// ==========================================
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Hệ thống đã kết nối Database MongoDB thành công'))
    .catch(err => console.error('❌ Lỗi kết nối Database:', err));

const User = require('./models/User');

// --- SCHEMA LƯU TRỮ YÊU CẦU RÚT TIỀN ---
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
// 5. HỆ THỐNG QUẢNG CÁO (ADSGRAM CALLBACK)
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

        user.totalCoins = (user.totalCoins || 0) + amount;
        user[limitKey] = (user[limitKey] || 0) + 1;
        user.adsWatchedToday = (user.adsWatchedToday || 0) + 1;

        await user.save();
        return { ok: true };
    } catch (e) { return { ok: false }; }
}

app.get('/api/ads-rewarded', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'video', 250000);
    res.send(result.ok ? 'OK' : result.msg);
});

app.get('/api/ads-interstitial', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'interstitial', 100000);
    res.send(result.ok ? 'OK' : result.msg);
});

app.get('/api/ads-banner', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'banner', 25000);
    res.send(result.ok ? 'OK' : result.msg);
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
            vndEstimate: Math.floor(user.totalCoins / EXCHANGE_RATE),
            miningStatus: user.isMining
        });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/get-realtime-data', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false });

        let currentTotal = user.totalCoins;
        if (user.isMining && user.miningStartedAt) {
            const diffSeconds = (new Date() - new Date(user.miningStartedAt)) / 1000;
            const rate = user.miningRate || 12.0;
            currentTotal += (diffSeconds * rate);
        }

        res.json({ 
            ok: true, 
            totalCoins: Math.floor(currentTotal),
            vndEstimate: Math.floor(currentTotal / EXCHANGE_RATE),
            diamonds: user.diamonds 
        });
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
        // Cập nhật: Mỗi cấp tăng thêm 0.2 xu/s
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
// 8. LOGIC ĐÀO (MINING)
// ==========================================
app.post('/api/mining', async (req, res) => {
    const { id, action } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (action === 'start') {
            user.isMining = true;
            user.miningStartedAt = new Date();
        } else {
            user.isMining = false;
            user.miningStartedAt = null;
        }
        await user.save();
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

app.post('/api/mining-sync', async (req, res) => {
    const { id, addedCoins } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user || !user.isMining) return res.json({ ok: false });
        
        // Chống hack: Giới hạn tối đa nhận được trong 10-15s
        if (addedCoins > (user.miningRate * 20)) return res.json({ ok: false });

        user.totalCoins += addedCoins;
        await user.save();
        res.json({ ok: true, totalCoins: user.totalCoins });
    } catch (e) { res.json({ ok: false }); }
});

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
