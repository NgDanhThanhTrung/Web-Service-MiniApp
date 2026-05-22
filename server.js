const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, BOT_USERNAME, MONGODB_URI } = process.env;

// --- KẾT NỐI MONGODB ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Hệ thống đã kết nối Database MongoDB'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));

const User = require('./models/User');

// --- SCHEMA RÚT TIỀN ---
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ĐIỀU HƯỚNG ---
app.get(['/', '/app'], (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/config', (req, res) => {
    res.json({ botUser: BOT_USERNAME || 'YourBotUsername' });
});

// --- HÀM XỬ LÝ PHẦN THƯỞNG DÙNG CHUNG ---
async function processAdReward(userId, type, amount) {
    if (!userId) return { ok: false, msg: 'Missing userId' };
    
    const user = await User.findOne({ telegramId: userId.toString() });
    if (!user) return { ok: false, msg: 'User not found' };

    const now = new Date();
    const today = now.toDateString();

    if (user.lastActiveDay !== today) {
        user.dailyVideo = 0;
        user.dailyInterstitial = 0;
        user.dailyBanner = 0;
        user.adsWatchedToday = 0;
        user.lastActiveDay = today;
    }

    const limitKey = `daily${type.charAt(0).toUpperCase() + type.slice(1)}`; 
    const cooldownKey = `last${type.charAt(0).toUpperCase() + type.slice(1)}`;

    if (user[limitKey] >= 15) return { ok: false, msg: 'Hôm nay bạn đã xem hết lượt!' };
    
    if (user[cooldownKey] && (now - user[cooldownKey]) / 1000 < 5) {
        return { ok: false, msg: 'Thao tác quá nhanh!' };
    }

    user.totalCoins = (user.totalCoins || 0) + amount;
    user[limitKey] = (user[limitKey] || 0) + 1;
    user[cooldownKey] = now;
    user.adsWatchedToday = (user.adsWatchedToday || 0) + 1;

    await user.save();
    return { ok: true };
}

// --- API CALLBACK ADSGRAM ---
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

// --- API USER STATUS ---
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username } = req.body;
    if (!id) return res.status(400).send("Missing ID");
    
    try {
        let user = await User.findOne({ telegramId: id.toString() });
        const today = new Date().toDateString();

        if (!user) {
            user = new User({ 
                telegramId: id.toString(), name: first_name, username: username || 'n/a', 
                lastActiveDay: today, level: 1, totalCoins: 0, diamonds: 0 
            });
            await user.save();
        } else if (user.lastActiveDay !== today) {
            user.adsWatchedToday = 0; user.dailyVideo = 0; user.dailyInterstitial = 0;
            user.dailyBanner = 0; user.lastActiveDay = today;
            await user.save();
        }

        res.json({
            ...user._doc,
            id: user.telegramId,
            coins: user.totalCoins,
            first_name: user.name,
            miningStatus: user.isMining,
            miningTime: user.miningStartedAt
        });
    } catch (e) { res.status(500).json(e); }
});
// --- THÊM API NÀY VÀO ĐÂY ---
app.post('/api/get-realtime-data', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false });

        let currentTotal = user.totalCoins;
        // Tính toán số xu tạm thời nếu đang đào
        if (user.isMining && user.miningStartedAt) {
            const diffSeconds = (new Date() - new Date(user.miningStartedAt)) / 1000;
            // Dùng miningRate từ DB hoặc mặc định 12.0
            const rate = user.miningRate || 12.0;
            currentTotal += (diffSeconds * rate);
        }

        res.json({ 
            ok: true, 
            totalCoins: Math.floor(currentTotal), 
            diamonds: user.diamonds 
        });
    } catch (e) {
        res.json({ ok: false });
    }
});
// --- API MINING TICK (Ghi trực tiếp vào DB mỗi giây) ---
app.post('/api/mining-tick', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user || !user.isMining) return res.json({ ok: false });

        // Tính tốc độ theo level (12.0 base + bonus)
        const ratePerSecond = 12.0 + ((user.level || 1) - 1) * 0.2;
        
        // Cộng trực tiếp vào tổng xu
        user.totalCoins += ratePerSecond;
        await user.save(); // Ghi thẳng vào MongoDB

        res.json({ ok: true, currentTotal: Math.floor(user.totalCoins) });
    } catch (e) { 
        res.json({ ok: false }); 
    }
});

// --- CẬP NHẬT LẠI API MINING START/CLAIM ---
app.post('/api/mining', async (req, res) => {
    const { id, action } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Lỗi người dùng" });

        if (action === 'start') {
            if (user.isMining) return res.json({ ok: false, msg: "Máy đang đào rồi!" });
            user.isMining = true;
            user.miningStartedAt = new Date();
            await user.save();
            return res.json({ ok: true });
        }

        if (action === 'claim') {
            // Sau khi đã chạy tick mỗi giây, nút claim có thể dùng để reset trạng thái
            user.isMining = false;
            user.miningStartedAt = null;
            await user.save();
            return res.json({ ok: true, coins: Math.floor(user.totalCoins) });
        }
    } catch (e) { res.json({ ok: false }); }
});
// --- NÂNG CẤP & THƯỞNG CỘT MỐC ---
app.post('/api/upgrade', async (req, res) => {
    const { id } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        const cost = 1000 + (user.level - 1) * 500; 

        if (user.diamonds < cost) return res.json({ ok: false, msg: `Cần ${cost} 💎` });

        user.diamonds -= cost;
        user.level += 1;

        let bonusMsg = "";
        if ([10, 20, 30].includes(user.level)) {
            user.totalCoins += 250000;
            bonusMsg = " + Thưởng 250,000 Xu!";
        }

        await user.save();
        res.json({ ok: true, level: user.level, msg: "Lên cấp thành công" + bonusMsg });
    } catch (e) { res.json({ ok: false }); }
});

// --- RÚT TIỀN ---
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Lỗi xác thực" });

        if ((user.adsWatchedToday || 0) < 15) {
            return res.json({ ok: false, msg: `Cần xem đủ 15 QC hôm nay (${user.adsWatchedToday}/15)` });
        }

        const MIN_WITHDRAW = 4000000;
        if (amountXu < MIN_WITHDRAW) return res.json({ ok: false, msg: "Tối thiểu 4.000.000 Xu" });
        if (user.totalCoins < amountXu) return res.json({ ok: false, msg: "Số dư không đủ" });

        user.totalCoins -= amountXu;
        await user.save();

        const newRequest = new Withdraw({ userId: id.toString(), name: user.name, amountXu, method, address });
        await newRequest.save();
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

// --- ADMIN & OTHERS ---
app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    try {
        const users = await User.find().sort({ totalCoins: -1 }).limit(100);
        const withdraws = await Withdraw.find().sort({ createdAt: -1 });
        res.json({ users, withdraws });
    } catch (e) { res.status(500).send("Error"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
