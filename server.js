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

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to Shared MongoDB'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// 1. Cấu hình động từ Render
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// 2. Status & Referral Logic (Nâng cấp nhận diện ID/Username)
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();
    
    try {
        // Cập nhật thông tin mới nhất của User mỗi khi họ vào App
        let user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { username: username || 'n/a', name: name || 'Người dùng' } },
            { new: true }
        );

        if (!user) {
            // Nếu là người dùng mới
            user = new User({ telegramId, username, name });
            if (refId && refId !== telegramId) {
                const boss = await User.findOne({ telegramId: refId });
                if (boss) {
                    boss.totalCoins += 10000;
                    boss.refs += 1;
                    await boss.save();
                    user.spinsLeft += 2; // Người được mời nhận thêm 2 lượt
                }
            }
            await user.save();
        } else {
            // Reset lượt xem Ads nếu sang ngày mới
            if (user.lastActiveDay !== today) {
                user.adsWatchedToday = 0;
                user.lastActiveDay = today;
                await user.save();
            }
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: "DB Error" }); }
});

// 3. Claim Xu (Giữ nguyên full logic)
app.post('/api/claim', async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.body.telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (user.spinsLeft > 0) {
            user.spinsLeft--;
        } else if (user.adsWatchedToday < 15) {
            user.adsWatchedToday++;
        } else {
            return res.json({ success: false, message: "Hết lượt hôm nay!" });
        }

        const lucky = Math.floor(Math.random() * 49501) + 500;
        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 4. Rút tiền & Thông báo Admin (Markdown chuyên nghiệp)
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const cost = amountVnd * 1000;

        if (!user || user.totalCoins < cost) return res.json({ success: false, message: "Số dư không đủ!" });

        user.totalCoins -= cost;
        await user.save();

        const text = `💰 **YÊU CẦU RÚT TIỀN**\n` +
                     `👤: ${user.name} (@${user.username})\n` +
                     `💵: ${Number(amountVnd).toLocaleString()} VNĐ\n` +
                     `🏦: ${method}\n` +
                     `📝: \`${details}\``;
        
        fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: process.env.ADMIN_ID, text, parse_mode: 'Markdown' })
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== process.env.ADMIN_PASS) return res.sendStatus(403);
    const users = await User.find({}).sort({ totalCoins: -1 });
    res.json(users);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Web Service running on port ${PORT}`));
