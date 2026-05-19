const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const User = require('./models/User'); // Đảm bảo copy folder models từ Repo A sang

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI);

// API gửi cấu hình nhạy cảm xuống Client
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// API Status & Referral
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, username, name });
        if (refId && refId !== telegramId) {
            const boss = await User.findOne({ telegramId: refId });
            if (boss) { boss.totalCoins += 10000; boss.refs += 1; await boss.save(); user.spinsLeft += 2; }
        }
        await user.save();
    }
    res.json(user);
});

// API Claim Xu
app.post('/api/claim', async (req, res) => {
    const user = await User.findOne({ telegramId: req.body.telegramId });
    if (user.spinsLeft > 0) user.spinsLeft--;
    else if (user.adsWatchedToday < 15) user.adsWatchedToday++;
    else return res.json({ success: false });

    const lucky = Math.floor(Math.random() * 49501) + 500;
    user.totalCoins += lucky;
    await user.save();
    res.json({ success: true, lucky, user });
});

// API Rút tiền (Gửi tin về Admin)
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user || user.totalCoins < amountVnd * 1000) return res.json({ success: false });

    user.totalCoins -= amountVnd * 1000;
    await user.save();

    const text = `💰 **RÚT TIỀN**: ${user.name}\n💵 ${amountVnd}đ - ${method}\n📝 STK: ${details}`;
    fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.ADMIN_ID, text, parse_mode: 'Markdown' })
    });
    res.json({ success: true });
});

// Routes Giao diện
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== process.env.ADMIN_PASS) return res.sendStatus(403);
    res.json(await User.find({}).sort({ totalCoins: -1 }));
});

app.listen(process.env.PORT || 3000);
