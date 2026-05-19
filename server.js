const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Web Server kết nối MongoDB thành công'))
    .catch(err => console.error('❌ Lỗi DB:', err));

// --- ROUTE GIAO DIỆN ---
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/', (req, res) => res.redirect('/app'));

// --- API LOGIC ---

// 1. Lấy thông tin User & Xử lý Referral (Ref)
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            // Tạo mới người dùng
            user = new User({ telegramId, username, name });
            
            // Nếu có refId (người giới thiệu)
            if (refId && refId !== telegramId) {
                const referrer = await User.findOne({ telegramId: refId });
                if (referrer) {
                    referrer.totalCoins += 10000; // Thưởng 10k xu cho người mời
                    referrer.refs += 1;
                    await referrer.save();
                    user.spinsLeft += 2; // Thưởng 2 lượt quay cho người mới
                }
            }
            await user.save();
        } else {
            // Reset lượt xem quảng cáo nếu sang ngày mới
            if (user.lastActiveDay !== today) {
                user.adsWatchedToday = 0;
                user.lastActiveDay = today;
                await user.save();
            }
        }
        res.json(user);
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

// 2. Xử lý Claim Xu (Vòng quay hoặc Quảng cáo)
app.post('/api/claim', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (user.spinsLeft > 0) {
            user.spinsLeft--;
        } else if (user.adsWatchedToday < 15) {
            user.adsWatchedToday++;
        } else {
            return res.json({ success: false, message: "Hết lượt hôm nay!" });
        }

        // Tỷ lệ nhận xu: 500 - 50,000
        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        user.totalCoins += lucky;
        await user.save();

        res.json({ success: true, lucky, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 3. Xử lý Rút tiền & Gửi thông báo cho Admin qua Bot
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    const { BOT_TOKEN, ADMIN_ID } = process.env;

    try {
        const user = await User.findOne({ telegramId });
        const cost = amountVnd * 1000;

        if (!user || user.totalCoins < cost) return res.json({ success: false, message: "Không đủ xu!" });

        user.totalCoins -= cost;
        await user.save();

        // Gửi thông báo về Telegram cho bạn (Admin)
        const msg = `💰 **YÊU CẦU RÚT TIỀN**\n` +
                    `━━━━━━━━━━━━━━━\n` +
                    `👤 Khách: ${user.name} (@${user.username || 'n/a'})\n` +
                    `💵 Số tiền: ${Number(amountVnd).toLocaleString()} VNĐ\n` +
                    `🏦 Cổng: ${method.toUpperCase()}\n` +
                    `📝 STK: \`${details}\`\n` +
                    `━━━━━━━━━━━━━━━\n` +
                    `🚀 Hãy xử lý lệnh rút này!`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_ID, text: msg, parse_mode: 'Markdown' })
        });

        res.json({ success: true, totalCoins: user.totalCoins });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 4. API Quản trị (Dành cho trang /account)
app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== process.env.ADMIN_PASS) return res.status(403).send("Forbidden");
    const users = await User.find({}).sort({ totalCoins: -1 });
    res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web Server running on port ${PORT}`));
