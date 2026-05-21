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

// Kết nối MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('🚀 [Database] Kết nối thành công'))
    .catch(err => console.error('❌ [Database] Lỗi kết nối:', err));

// API Cấu hình lấy ID từ môi trường Render
app.get('/api/config', (req, res) => {
    res.json({
        adsgramId: process.env.ADSGRAM_BLOCK_ID,
        botUsername: process.env.BOT_USERNAME
    });
});

// Logic: Nhận diện người dùng & Cập nhật Username thời gian thực
app.post('/api/status', async (req, res) => {
    const { telegramId, username, name, refId } = req.body;
    const today = new Date().toDateString();
    
    try {
        // Luôn cập nhật Username và Tên mới nhất từ Telegram vào DB
        let user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { username: username || 'n/a', name: name || 'Người dùng' } },
            { new: true, upsert: false }
        );

        if (!user) {
            // Tạo tài khoản mới nếu chưa tồn tại
            user = new User({ telegramId, username, name });
            // Xử lý Referral (Thưởng 10.000 xu cho người mời)
            if (refId && refId !== telegramId) {
                await User.findOneAndUpdate(
                    { telegramId: refId },
                    { $inc: { totalCoins: 10000, refs: 1 } }
                );
                user.spinsLeft += 2; // Người mới được tặng 2 lượt quay
            }
            await user.save();
        } else {
            // Reset giới hạn Ads mỗi khi qua ngày mới
            if (user.lastActiveDay !== today) {
                user.adsWatchedToday = 0;
                user.lastActiveDay = today;
                await user.save();
            }
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: "Lỗi Server" }); }
});

// Logic: Nhận thưởng (Claim)
app.post('/api/claim', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        let updateData = {};
        if (user.spinsLeft > 0) {
            updateData = { $inc: { spinsLeft: -1 } };
        } else if (user.adsWatchedToday < 15) {
            updateData = { $inc: { adsWatchedToday: 1 } };
        } else {
            return res.json({ success: false, message: "Hết lượt hôm nay!" });
        }

        const lucky = Math.floor(Math.random() * 49501) + 500; // Random 500 - 50,000 xu
        updateData.$inc.totalCoins = lucky;

        const updated = await User.findOneAndUpdate({ telegramId }, updateData, { new: true });
        res.json({ success: true, lucky, user: updated });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Logic: Rút tiền & Báo cáo Admin Telegram
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, amountVnd, method, details } = req.body;
    try {
        const cost = parseInt(amountVnd) * 1000;
        const user = await User.findOne({ telegramId });

        if (!user || user.totalCoins < cost) return res.json({ success: false, message: "Số dư không đủ!" });

        await User.findOneAndUpdate({ telegramId }, { $inc: { totalCoins: -cost } });

        // Gửi thông báo về Bot Admin
        const msg = `💰 *ĐƠN RÚT TIỀN MỚI*\n` +
                    `━━━━━━━━━━━━━━━\n` +
                    `👤 *Khách:* ${user.name}\n` +
                    `🔗 *User:* @${user.username}\n` +
                    `💵 *Số tiền:* ${Number(amountVnd).toLocaleString()} VNĐ\n` +
                    `🏦 *Cổng:* ${method.toUpperCase()}\n` +
                    `📝 *STK:* \`${details}\``;

        fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: process.env.ADMIN_ID, text: msg, parse_mode: 'Markdown' })
        });

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Các tuyến đường file
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.listen(process.env.PORT || 3000);
