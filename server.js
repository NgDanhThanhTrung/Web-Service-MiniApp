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

// Schema Rút tiền (Đồng bộ userId là String để khớp với telegramId)
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

// --- API FRONTEND ---

app.get('/api/config', (req, res) => {
    res.json({ 
        blockId: ADSGRAM_BLOCK_ID || "30869", 
        botUser: BOT_USERNAME 
    });
});

app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username } = req.body;
    try {
        // Tìm bằng telegramId (String) để khớp với Bot và Model gốc
        let user = await User.findOne({ telegramId: id.toString() });
        const today = new Date().toDateString();

        if (!user) {
            // Nếu người dùng vào thẳng web, tự tạo doc mới theo đúng model
            user = new User({ 
                telegramId: id.toString(), 
                name: first_name, 
                username: username || 'n/a', 
                lastActiveDay: today, 
                spinsLeft: 5, 
                adsWatchedToday: 0,
                totalCoins: 0
            });
            await user.save();
        } else if (user.lastActiveDay !== today) {
            // Reset 5 lượt quay và 0 lượt xem QC mỗi ngày
            user.spinsLeft = 5;
            user.adsWatchedToday = 0;
            user.lastActiveDay = today;
            await user.save();
        }

        // Ánh xạ (Map) dữ liệu để Frontend cũ vẫn đọc được (coins, id, adsWatched...)
        const mappedUser = {
            ...user._doc,
            id: user.telegramId,
            coins: user.totalCoins,
            first_name: user.name,
            adsWatched: user.adsWatchedToday
        };
        res.json(mappedUser);
    } catch (e) { res.status(500).json(e); }
});

app.get('/api/ads-callback', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('Missing userId');

    try {
        const user = await User.findOne({ telegramId: userId.toString() });
        if (user) {
            const lucky = Math.floor(Math.random() * 49501) + 500;
            user.totalCoins += lucky;
            user.adsWatchedToday = (user.adsWatchedToday || 0) + 1;
            await user.save();
            res.send('OK'); 
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) { res.status(500).send('Server Error'); }
});

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

app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    try {
        const user = await User.findOne({ telegramId: id.toString() });
        if (!user) return res.json({ ok: false, msg: "Lỗi xác thực" });

        if ((user.adsWatchedToday || 0) < 5) {
            return res.json({ ok: false, msg: `Cần xem đủ 5 QC (Hiện tại: ${user.adsWatchedToday}/5)` });
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

// --- ADMIN API ---

app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    try {
        const users = await User.find().sort({ totalCoins: -1 }).limit(100);
        const withdraws = await Withdraw.find().sort({ createdAt: -1 });
        
        // Map lại dữ liệu cho Admin hiển thị
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
