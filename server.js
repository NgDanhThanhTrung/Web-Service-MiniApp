const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch'); // Đảm bảo đã npm install node-fetch@2
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Kết nối MongoDB (Dùng chung URI với Tài khoản A)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Web Server kết nối DB thành công'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));

// --- ROUTE GIAO DIỆN ---
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/', (req, res) => res.redirect('/app'));

// --- API LOGIC ---

// 1. Đồng bộ User & Xử lý Referral (Ref)
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();

    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username, name });
            if (refId && refId !== telegramId) {
                const boss = await User.findOne({ telegramId: refId });
                if (boss) {
                    boss.totalCoins += 10000;
                    boss.refs += 1;
                    await boss.save();
                    user.spinsLeft += 2;
                }
            }
            await user.save();
        } else {
            if (user.lastActiveDay !== today) {
                user.adsWatchedToday = 0;
                user.lastActiveDay = today;
                await user.save();
            }
        }
        res.json(user);
    } catch (err) { res.status(500).json({ error: "Lỗi Server" }); }
});

// 2. Xử lý Claim Xu (Vòng quay/Adsgram)
app.post('/api/claim', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (user.spinsLeft > 0) user.spinsLeft--;
        else if (user.adsWatchedToday < 15) user.adsWatchedToday++;
        else return res.json({ success: false, message: "Hết lượt!" });

        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 3. API Rút tiền: Gửi thông báo về ADMIN (Không dùng Telegraf để tránh xung đột)
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    const { BOT_TOKEN, ADMIN_ID } = process.env;

    try {
        const user = await User.findOne({ telegramId });
        const cost = amountVnd * 1000;

        if (!user || user.totalCoins < cost) return res.json({ success: false, message: "Không đủ xu!" });

        user.totalCoins -= cost;
        await user.save();

        // Gửi thông báo cho Admin bằng HTTP Request (Outbound)
        const text = `💰 **YÊU CẦU RÚT TIỀN**\n` +
                     `👤 Khách: ${user.name} (@${user.username})\n` +
                     `💵 Số tiền: ${Number(amountVnd).toLocaleString()} VNĐ\n` +
                     `🏦 Cổng: ${method.toUpperCase()}\n` +
                     `📝 Chi tiết: \`${details}\``;

        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'Markdown' })
        });

        res.json({ success: true, totalCoins: user.totalCoins });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 4. API Admin cho trang /account
app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== process.env.ADMIN_PASS) return res.sendStatus(403);
    const users = await User.find({}).sort({ totalCoins: -1 });
    res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web Server running on port ${PORT}`));
