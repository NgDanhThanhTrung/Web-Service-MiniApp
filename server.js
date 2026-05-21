const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, ADSGRAM_BLOCK_ID, BOT_USERNAME, MONGODB_URI } = process.env;

// Kết nối MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Hệ thống Web đã đồng bộ với Tài khoản A'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));

const User = require('./models/User');

// Schema Rút tiền
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

// --- ĐIỀU HƯỚNG GIAO DIỆN ---
app.get(['/', '/app'], (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// --- HÀM XỬ LÝ PHẦN THƯỞNG DÙNG CHUNG ---
async function processAdReward(userId, type, amount) {
    if (!userId) return { ok: false, msg: 'Missing userId' };
    
    const user = await User.findOne({ telegramId: userId.toString() });
    if (!user) return { ok: false, msg: 'User not found' };

    const now = new Date();
    const today = now.toDateString();

    // 1. Reset giới hạn ngày mới
    if (user.lastActiveDay !== today) {
        user.dailyVideo = 0;
        user.dailyInterstitial = 0;
        user.dailyBanner = 0;
        user.adsWatchedToday = 0; // Reset biến cũ nếu cần
        user.lastActiveDay = today;
    }

    // Định nghĩa tên trường dựa trên loại (tiếng Anh)
    const limitKey = `daily${type.charAt(0).toUpperCase() + type.slice(1)}`; 
    const cooldownKey = `last${type.charAt(0).toUpperCase() + type.slice(1)}`;

    // 2. Kiểm tra giới hạn 10 lượt/ngày mỗi loại
    if (user[limitKey] >= 10) return { ok: false, msg: 'Daily limit reached' };

    // 3. Kiểm tra Cooldown 5 giây cùng loại
    if (user[cooldownKey] && (now - user[cooldownKey]) / 1000 < 5) {
        return { ok: false, msg: 'Cooldown active' };
    }

    // 4. Cập nhật dữ liệu
    user.totalCoins += amount;
    user[limitKey] += 1;
    user[cooldownKey] = now;
    
    // Tăng tổng lượt click để rút tiền (Điều kiện 5 lượt)
    user.adsWatchedToday = (user.adsWatchedToday || 0) + 1;

    await user.save();
    return { ok: true };
}

// --- API CALLBACK CHO ADSGRAM (Điền vào Dashboard Adsgram) ---

// 1. Video: 75,000 Xu
app.get('/api/ads-video', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'video', 75000);
    res.send(result.ok ? 'OK' : result.msg);
});

// 2. Interstitial: 50,000 Xu
app.get('/api/ads-interstitial', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'interstitial', 50000);
    res.send(result.ok ? 'OK' : result.msg);
});

// 3. Banner: 25,000 Xu
app.get('/api/ads-banner', async (req, res) => {
    const result = await processAdReward(req.query.userId, 'banner', 25000);
    res.send(result.ok ? 'OK' : result.msg);
});

// --- API USER STATUS ---
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username } = req.body;
    try {
        let user = await User.findOne({ telegramId: id.toString() });
        const today = new Date().toDateString();

        if (!user) {
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
            user.spinsLeft = 5;
            user.adsWatchedToday = 0;
            user.dailyVideo = 0;
            user.dailyInterstitial = 0;
            user.dailyBanner = 0;
            user.lastActiveDay = today;
            await user.save();
        }

        const mappedUser = {
            ...user._doc,
            id: user.telegramId,
            coins: user.totalCoins,
            first_name: user.name,
            adsWatched: user.adsWatchedToday // Trả về tổng lượt click để Frontend kiểm tra nút rút tiền
        };
        res.json(mappedUser);
    } catch (e) { res.status(500).json(e); }
});

// --- RÚT TIỀN (KIỂM TRA 5 LƯỢT CLICK) ---
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Lỗi xác thực" });

        // KIỂM TRA ĐIỀU KIỆN 5 LƯỢT CLICK TỔNG THỂ
        const totalClicks = user.adsWatchedToday || 0;
        if (totalClicks < 5) {
            return res.json({ ok: false, msg: `Cần xem ít nhất 5 quảng cáo bất kỳ để rút. (Hiện tại: ${totalClicks}/5)` });
        }

        if (!amountXu || amountXu < 300000) {
            return res.json({ ok: false, msg: "Tối thiểu rút 300.000 XU" });
        }

        if (user.totalCoins < amountXu) {
            return res.json({ ok: false, msg: "Số dư không đủ" });
        }

        user.totalCoins -= amountXu;
        await user.save();

        const newRequest = new Withdraw({ 
            userId: id.toString(), 
            name: user.name, 
            amountXu, method, address 
        });
        await newRequest.save();
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

// --- CÁC API KHÁC GIỮ NGUYÊN ---
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Người dùng không tồn tại" });
        if (action === 'spin') {
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

app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    try {
        const users = await User.find().sort({ totalCoins: -1 }).limit(100);
        const withdraws = await Withdraw.find().sort({ createdAt: -1 });
        const mappedUsers = users.map(u => ({
            ...u._doc,
            id: u.telegramId,
            coins: u.totalCoins,
            first_name: u.name
        }));
        res.json({ users: mappedUsers, withdraws });
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.sendStatus(403);
    try {
        await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Đã thanh toán' });
        res.json({ ok: true });
    } catch (e) { res.status(500).send("Error"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Web Server đồng bộ đang chạy tại cổng ${PORT}`));
