const { Telegraf, Markup } = require('telegraf'); // Lỗi Module Not Found nằm ở đây nếu thiếu package.json
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');

const app = express();

// Đảm bảo các biến môi trường này đã được SET trên Render Dashboard
const { 
    BOT_TOKEN, ADMIN_ID, ADMIN_PASS, 
    ADSGRAM_BLOCK_ID, BOT_USERNAME, 
    MONGODB_URI, MY_APP_LINK 
} = process.env;

// Kiểm tra biến môi trường quan trọng trước khi chạy
if (!BOT_TOKEN || !MONGODB_URI) {
    console.error("❌ THIẾU BIẾN MÔI TRƯỜNG BOT_TOKEN HOẶC MONGODB_URI!");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Kết nối Database thành công'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));

const User = require('./models/User');
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- HỆ THỐNG API VÀ ADMIN ---
app.get('/api/config', (req, res) => {
    res.json({ blockId: ADSGRAM_BLOCK_ID, botUser: BOT_USERNAME });
});

app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.status(403).send("Sai mật khẩu");
    const users = await User.find().sort({ coins: -1 });
    res.json(users);
});

// --- LOGIC ĐỒNG BỘ 1000 XU = 1 VNĐ ---
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
    } catch (e) { res.status(500).json(e); }
});

// --- RÚT TIỀN ---
app.post('/api/withdraw', async (req, res) => {
    const { id, amountVnd, method, address } = req.body;
    const user = await User.findOne({ id });
    const cost = parseInt(amountVnd) * 1000;
    if (!user || user.coins < cost) return res.json({ ok: false, msg: "Không đủ xu!" });
    user.coins -= cost;
    await user.save();
    bot.telegram.sendMessage(ADMIN_ID, `💰 RÚT TIỀN: ${user.first_name} - ${amountVnd} VNĐ - ${method} - ${address}`);
    res.json({ ok: true });
});

// --- BOT COMMANDS ---
bot.start((ctx) => ctx.reply("Chào mừng!", Markup.inlineKeyboard([[Markup.button.webApp("VÀO APP", MY_APP_LINK)]])));
bot.command('export', async (ctx) => {
    if (ctx.from.id !== parseInt(ADMIN_ID)) return;
    const users = await User.find().lean();
    const ws = XLSX.utils.json_to_sheet(users);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    ctx.replyWithDocument({ source: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), filename: 'Backup.xlsx' });
});

bot.launch();
app.listen(process.env.PORT || 3000);
