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

// Kết nối MongoDB với cơ chế Timeout để tránh treo Render
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('🚀 [DB] Connected'))
    .catch(err => console.error('❌ [DB] Error:', err.message));

// API lấy cấu hình cho Frontend
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// Nhận diện người dùng & Cập nhật Username/Tên thời gian thực
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();
    try {
        let user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { username: username || 'n/a', name: name || 'User' } },
            { new: true, upsert: true }
        );

        if (user.lastActiveDay !== today) {
            user.adsWatchedToday = 0;
            user.lastActiveDay = today;
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: "Server Error" }); }
});

// Logic nhận xu ngẫu nhiên 500 - 50.000
app.post('/api/claim', async (req, res) => {
    const { telegramId, isAds } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (!isAds && user.spinsLeft <= 0) {
            return res.json({ success: false, message: "Hết lượt quay miễn phí!" });
        }

        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        
        if (isAds) { user.adsWatchedToday += 1; } 
        else { user.spinsLeft -= 1; }

        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// API Quản trị (Dùng cho /account)
app.get('/api/admin/users', async (req, res) => {
    const { pass } = req.query;
    if (pass !== process.env.ADMIN_PASS) return res.status(403).send("Access Denied");
    const users = await User.find().sort({ totalCoins: -1 });
    res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
