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

// 1. Kết nối MongoDB Atlas (Đã thêm tùy chọn timeout để tránh treo server)
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
})
.then(() => console.log('🚀 [Database] Kết nối thành công'))
.catch(err => console.error('❌ [Database] Lỗi kết nối:', err.message));

// 2. Lấy cấu hình từ biến môi trường Render
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// 3. API Status: Nhận diện và Cập nhật Username/Tên
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();
    
    try {
        // Tìm và cập nhật thông tin mới nhất (Upsert: false vì ta sẽ tạo mới nếu không thấy)
        let user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { username: username || 'n/a', name: name || 'Người dùng' } },
            { new: true }
        );

        if (!user) {
            // Logic cho người dùng mới
            user = new User({ telegramId, username, name });
            if (refId && refId !== telegramId) {
                const boss = await User.findOne({ telegramId: refId });
                if (boss) {
                    boss.totalCoins += 10000;
                    boss.refs += 1;
                    await boss.save();
                    user.spinsLeft += 2; // Thưởng người mới 2 lượt
                }
            }
            await user.save();
        } else {
            // Reset Ads hàng ngày
            if (user.lastActiveDay !== today) {
                user.adsWatchedToday = 0;
                user.lastActiveDay = today;
                await user.save();
            }
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: "Lỗi hệ thống" }); }
});

// 4. Logic nhận thưởng (Claim)
app.post('/api/claim', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        if (user.spinsLeft <= 0 && user.adsWatchedToday >= 15) {
            return res.json({ success: false, message: "Hết lượt hôm nay!" });
        }

        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        
        if (user.spinsLeft > 0) {
            user.spinsLeft -= 1;
        } else {
            user.adsWatchedToday += 1;
        }

        user.totalCoins += lucky;
        await user.save();
        res.json({ success: true, lucky, user });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 5. Logic Rút tiền & Báo cáo Admin
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    try {
        const cost = parseInt(amountVnd) * 1000;
        const user = await User.findOne({ telegramId });

        if (!user || user.totalCoins < cost) return res.json({ success: false, message: "Số dư không đủ!" });

        user.totalCoins -= cost;
        await user.save();

        const msg = `💰 *YÊU CẦU RÚT TIỀN*\n` +
                    `👤 Tên: ${user.name}\n` +
                    `🔗 User: @${user.username}\n` +
                    `💵 Số tiền: ${Number(amountVnd).toLocaleString()} VNĐ\n` +
                    `🏦 Cổng: ${method}\n` +
                    `📝 STK: \`${details}\``;

        fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: process.env.ADMIN_ID, text: msg, parse_mode: 'Markdown' })
        });

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
