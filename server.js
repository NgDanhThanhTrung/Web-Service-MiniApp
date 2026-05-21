const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Kết nối Database (Bắt buộc phải có biến MONGODB_URI trên Render)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// Định tuyến cho trang Admin (Địa chỉ: /account)
app.get('/account', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// Lấy cấu hình từ Render Environment
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// API: Đồng bộ User từ Telegram
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name } = req.body;
    try {
        let user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { username: username || 'n/a', name: name || 'User' } },
            { new: true, upsert: true }
        );
        res.json(user);
    } catch (e) { res.status(500).json({ error: "Server Error" }); }
});

// API: Nhận xu ngẫu nhiên (500 - 50,000)
app.post('/api/claim', async (req, res) => {
    const { telegramId, isAds } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (!isAds && user.spinsLeft <= 0) {
            return res.json({ success: false, message: "Hết lượt free, hãy xem quảng cáo!" });
        }

        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        
        if (isAds) user.adsWatchedToday += 1;
        else user.spinsLeft -= 1;

        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// API: Danh sách người dùng cho Admin
app.get('/api/admin/users', async (req, res) => {
    const { pass } = req.query;
    if (pass !== process.env.ADMIN_PASS) return res.status(403).send("Forbidden");
    const users = await User.find().sort({ totalCoins: -1 });
    res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 App running on port ${PORT}`));
