/**
 * SIÊU CẤP KIẾM XU - PHIÊN BẢN V2 (DATABASE SYNC)
 * Khôi phục đầy đủ /account và đồng bộ ADSGRAM_BLOCK_ID
 */
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const MONGODB_URI = process.env.MONGODB_URI;
const MY_APP_LINK = process.env.MY_APP_LINK;
const ADSGRAM_BLOCK_ID = process.env.ADSGRAM_BLOCK_ID;

// Kết nối Database
mongoose.connect(MONGODB_URI).then(() => console.log('✅ MongoDB Connected'));

const User = require('./models/User');
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- HỆ THỐNG QUẢN TRỊ (KHÔI PHỤC) ---
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.status(403).send("Từ chối truy cập");
    const users = await User.find().sort({ coins: -1 });
    res.json(users);
});

app.get('/api/config', (req, res) => {
    res.json({ blockId: ADSGRAM_BLOCK_ID });
});

// API 1: Đồng bộ User & Referral (10,000 Xu cho người mời)
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            user = new User({ id, first_name, username, lastActiveDate: today });
            if (start_param && parseInt(start_param) !== id) {
                const inviter = await User.findOne({ id: parseInt(start_param) });
                if (inviter) {
                    inviter.coins += 10000;
                    inviter.refs += 1;
                    await inviter.save();
                    user.spinsLeft += 5; 
                }
            }
            await user.save();
        } else if (user.lastActiveDate !== today) {
            user.spinsLeft = 10; 
            user.lastActiveDate = today;
            await user.save();
        }
        res.json(user);
    } catch (err) { res.status(500).json(err); }
});

// API 2: Nhận Xu (Action: spin hoặc ads)
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

        const msg = `💰 *YÊU CẦU RÚT TIỀN*\n👤: ${user.first_name} (@${user.username})\n💵: ${amountVnd.toLocaleString()} VNĐ\n🏦: ${method}\n📍: \`${address}\``;
        bot.telegram.sendMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false }); }
});

// Lệnh Export Excel (Cho Bot)
bot.command('export', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const users = await User.find().lean();
    const ws = XLSX.utils.json_to_sheet(users);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    ctx.replyWithDocument({ source: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), filename: 'Users_Backup.xlsx' });
});

// Anti-sleep cơ bản
setInterval(() => { require('https').get(MY_APP_LINK); }, 300000);

bot.start((ctx) => {
    ctx.reply(`Chào mừng ${ctx.from.first_name}!`, Markup.inlineKeyboard([
        [Markup.button.webApp("🚀 VÀO APP KIẾM TIỀN", MY_APP_LINK)]
    ]));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
bot.launch();
