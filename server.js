/**
 * SIÊU CẤP KIẾM XU - PHIÊN BẢN V2 (DATABASE SYNC)
 */
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const MONGODB_URI = process.env.MONGODB_URI;
const MY_APP_LINK = process.env.MY_APP_LINK;

// Kết nối Database
mongoose.connect(MONGODB_URI).then(() => console.log('✅ MongoDB Connected'));

const User = require('./models/User');
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 1: Đồng bộ User & Referral (10,000 Xu cho người mời)
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            user = new User({ id, first_name, username, lastActiveDate: today });
            // Logic Referral
            if (start_param && parseInt(start_param) !== id) {
                const inviter = await User.findOne({ id: parseInt(start_param) });
                if (inviter) {
                    inviter.coins += 10000;
                    inviter.refs += 1;
                    await inviter.save();
                    user.spinsLeft += 5; // Tặng người mới 5 lượt
                }
            }
            await user.save();
        } else {
            // Sáng tạo: Tự động reset lượt quay hàng ngày khi user truy cập
            if (user.lastActiveDate !== today) {
                user.spinsLeft = 10; 
                user.lastActiveDate = today;
                await user.save();
            }
        }
        res.json(user);
    } catch (err) { res.status(500).json(err); }
});

// API 2: Nhận Xu (Random 500 - 50,000)
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    try {
        const user = await User.findOne({ id });
        if (!user) return res.status(404).json({ ok: false });

        if (action === 'spin' && user.spinsLeft <= 0) {
            return res.json({ ok: false, msg: "Hết lượt quay miễn phí!" });
        }

        const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
        user.coins += lucky;
        if (action === 'spin') user.spinsLeft -= 1;
        
        await user.save();
        res.json({ ok: true, lucky, coins: user.coins, spinsLeft: user.spinsLeft });
    } catch (err) { res.status(500).json({ ok: false }); }
});

// API 3: Rút tiền (1000 Xu = 1 VNĐ)
app.post('/api/withdraw', async (req, res) => {
    const { id, amountVnd, method, address } = req.body;
    try {
        const user = await User.findOne({ id });
        const coinCost = amountVnd * 1000;

        if (!user || user.coins < coinCost) return res.json({ ok: false, msg: "Không đủ xu!" });

        user.coins -= coinCost;
        await user.save();

        // Gửi tin nhắn cho Admin
        const msg = `💰 *YÊU CẦU RÚT TIỀN*\n👤: ${user.first_name} (@${user.username})\n💵: ${amountVnd.toLocaleString()} VNĐ\n🏦: ${method}\n📍: \`${address}\``;
        bot.telegram.sendMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });

        res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false }); }
});

// Bot Telegram Control
bot.start((ctx) => {
    const welcomeMsg = `Chào mừng ${ctx.from.first_name}!\n🎁 Nhận ngay 10,000 xu khi mời bạn bè.\n🎡 Quay thưởng nhận tới 50,000 xu mỗi lượt.`;
    ctx.reply(welcomeMsg, Markup.inlineKeyboard([
        [Markup.button.webApp("🚀 VÀO APP KIẾM TIỀN", MY_APP_LINK)]
    ]));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
bot.launch();
