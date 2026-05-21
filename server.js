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

// Kết nối MongoDB (Nhớ whitelist IP 0.0.0.0/0 trên Atlas)
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('✅ Kết nối Database thành công'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err.message));

// 1. API Config: Lấy thông tin môi trường
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// 2. API Status: Nhận diện người dùng & Cập nhật Username
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();
    try {
        let user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { username: username || 'n/a', name: name || 'Người dùng' } },
            { new: true, upsert: true }
        );

        if (user.lastActiveDay !== today) {
            user.adsWatchedToday = 0;
            user.lastActiveDay = today;
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: "Lỗi Server" }); }
});

// 3. API Claim: Nhận xu ngẫu nhiên (500 - 50,000)
app.post('/api/claim', async (req, res) => {
    const { telegramId, isAds } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (!isAds && user.spinsLeft <= 0) {
            return res.json({ success: false, message: "Hết lượt quay miễn phí!" });
        }

        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        
        if (isAds) {
            user.adsWatchedToday += 1;
        } else {
            user.spinsLeft -= 1;
        }

        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 4. API Admin: Lấy danh sách cho trang /account
app.get('/api/admin/users', async (req, res) => {
    const { pass } = req.query;
    if (pass !== process.env.ADMIN_PASS) return res.status(403).json({ error: "Unauthorized" });
    const users = await User.find().sort({ totalCoins: -1 });
    res.json(users);
});

// Điều hướng giao diện
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
