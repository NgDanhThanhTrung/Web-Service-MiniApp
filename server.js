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

// API lấy config cho Link Ref
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

    // Reset ngày mới nếu callback chạy trước khi user mở app
    if (user.lastActiveDay !== today) {
        user.dailyVideo = 0;
        user.dailyInterstitial = 0;
        user.dailyBanner = 0;
        user.adsWatchedToday = 0; 
        user.lastActiveDay = today;
        user.spinsLeft = (user.spinsLeft || 0) + 1; // Thưởng 1 lượt ngày mới
    }

    const limitKey = `daily${type.charAt(0).toUpperCase() + type.slice(1)}`; 
    const cooldownKey = `last${type.charAt(0).toUpperCase() + type.slice(1)}`;

    if (user[limitKey] >= 15) return { ok: false, msg: 'Daily limit reached' };
    if (user[cooldownKey] && (now - user[cooldownKey]) / 1000 < 5) {
        return { ok: false, msg: 'Cooldown active' };
    }

    user.totalCoins = (user.totalCoins || 0) + amount;
    user[limitKey] = (user[limitKey] || 0) + 1;
    user[cooldownKey] = now;
    user.adsWatchedToday = (user.adsWatchedToday || 0) + 1;

    await user.save();
    console.log(`✅ [${type.toUpperCase()}] +${amount} xu cho ${userId}`);
    return { ok: true };
}

// --- API CALLBACK ADSGRAM ---

app.get('/api/ads-rewarded', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'video', 75000);
    res.send(result.ok ? 'OK' : result.msg);
});

app.get('/api/ads-interstitial', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'interstitial', 50000);
    res.send(result.ok ? 'OK' : result.msg);
});

app.get('/api/ads-banner', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'banner', 25000);
    res.send(result.ok ? 'OK' : result.msg);
});

// --- API USER STATUS (LOGIC LƯỢT QUAY) ---
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username } = req.body;
    if (!id) return res.status(400).send("Missing ID");
    
    try {
        let user = await User.findOne({ telegramId: id.toString() });
        const today = new Date().toDateString();

        if (!user) {
            // TÀI KHOẢN MỚI: Tặng 5 lượt quay
            user = new User({ 
                telegramId: id.toString(), 
                name: first_name, 
                username: username || 'n/a', 
                lastActiveDay: today, 
                spinsLeft: 5, 
                adsWatchedToday: 0,
                totalCoins: 0,
                dailyVideo: 0, dailyInterstitial: 0, dailyBanner: 0
            });
            await user.save();
        } else if (user.lastActiveDay !== today) {
            // QUA NGÀY MỚI: Chỉ tặng 1 lượt quay
            user.spinsLeft = (user.spinsLeft || 0) + 1; 
            user.adsWatchedToday = 0;
            user.dailyVideo = 0;
            user.dailyInterstitial = 0;
            user.dailyBanner = 0;
            user.lastActiveDay = today;
            await user.save();
        }

        res.json({
            ...user._doc,
            id: user.telegramId,
            coins: user.totalCoins,
            first_name: user.name,
            adsWatched: user.adsWatchedToday,
            spinsLeft: user.spinsLeft
        });
    } catch (e) { res.status(500).json(e); }
});

// --- RÚT TIỀN ---
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Lỗi xác thực" });

        if ((user.adsWatchedToday || 0) < 5) {
            return res.json({ ok: false, msg: `Cần xem ít nhất 5 quảng cáo để rút. (Hiện tại: ${user.adsWatchedToday}/5)` });
        }

        if (!amountXu || amountXu < 300000) return res.json({ ok: false, msg: "Tối thiểu 300k Xu" });
        if (user.totalCoins < amountXu) return res.json({ ok: false, msg: "Số dư không đủ" });

        user.totalCoins -= amountXu;
        await user.save();

        const newRequest = new Withdraw({ 
            userId: id.toString(), name: user.name, amountXu, method, address 
        });
        await newRequest.save();
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

// --- QUAY THƯỞNG ---
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (action === 'spin' && user) {
            if (user.spinsLeft <= 0) return res.json({ ok: false, msg: "Hết lượt quay!" });
            
            const lucky = Math.floor(Math.random() * 49501) + 500;
            user.totalCoins += lucky;
            user.spinsLeft -= 1;
            await user.save();
            return res.json({ ok: true, lucky, coins: user.totalCoins, spinsLeft: user.spinsLeft });
        }
        res.json({ ok: false });
    } catch (e) { res.json({ ok: false }); }
});

// --- ADMIN ---
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
