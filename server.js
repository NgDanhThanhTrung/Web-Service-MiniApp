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

// Kết nối MongoDB chung
mongoose.connect(process.env.MONGODB_URI);

// 1. API cung cấp cấu hình từ môi trường Render cho Web App
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// 2. API Status & Referral
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
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
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: "DB Error" }); }
});

// 3. API Claim Xu
app.post('/api/claim', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.body.telegramId });
        if (user.spinsLeft > 0) user.spinsLeft--;
        else if (user.adsWatchedToday < 15) user.adsWatchedToday++;
        else return res.json({ success: false, message: "Hết lượt!" });

        const lucky = Math.floor(Math.random() * 49501) + 500;
        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 4. API Rút tiền (Gửi thông báo về Admin qua Bot)
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user || user.totalCoins < amountVnd * 1000) return res.json({ success: false });

    user.totalCoins -= amountVnd * 1000;
    await user.save();

    const text = `💰 **YÊU CẦU RÚT TIỀN**\n👤: ${user.name}\n💵: ${amountVnd} VNĐ\n🏦: ${method}\n📝: ${details}`;
    
    // Gửi tin nhắn outbound không gây xung đột webhook
    fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.ADMIN_ID, text, parse_mode: 'Markdown' })
    });
    res.json({ success: true });
});

// 5. Giao diện & Admin
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== process.env.ADMIN_PASS) return res.sendStatus(403);
    res.json(await User.find({}).sort({ totalCoins: -1 }));
});

app.listen(process.env.PORT || 3000);
