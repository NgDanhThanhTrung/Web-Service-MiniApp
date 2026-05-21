const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const { 
    BOT_TOKEN, ADMIN_ID, ADMIN_PASS, 
    ADSGRAM_BLOCK_ID, BOT_USERNAME, 
    MONGODB_URI, MY_APP_LINK 
} = process.env;

// Kết nối MongoDB
mongoose.connect(MONGODB_URI).then(() => console.log('✅ MongoDB Connected'));

const User = require('./models/User');
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CHỨC NĂNG ADMIN /ACCOUNT ---
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.status(403).send("Sai mật khẩu Admin");
    const users = await User.find().sort({ coins: -1 });
    res.json(users);
});

app.get('/api/config', (req, res) => {
    res.json({ blockId: ADSGRAM_BLOCK_ID, botUser: BOT_USERNAME });
});

// --- API XỬ LÝ NGƯỜI DÙNG ---
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            user = new User({ id, first_name, username, lastActiveDate: today });
            // Thưởng giới thiệu 10k xu
            if (start_param && parseInt(start_param) !== id) {
                const inviter = await User.findOne({ id: parseInt(start_param) });
                if (inviter) {
                    inviter.coins += 10000;
                    inviter.refs += 1;
                    await inviter.save();
                    user.spinsLeft += 5; // Người mới được 5 lượt
                }
            }
            await user.save();
        } else if (user.lastActiveDate !== today) {
            user.spinsLeft = 10; // Reset lượt quay mỗi ngày
            user.dailyAdsCount = 0;
            user.lastActiveDate = today;
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json(e); }
});

// API Nhận Xu (Quay hoặc Xem QC)
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ ok: false });

    if (action === 'spin' && user.spinsLeft <= 0) return res.json({ ok: false, msg: "Hết lượt quay!" });

    const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
    user.coins += lucky;
    if (action === 'spin') user.spinsLeft -= 1;
    if (action === 'ads') user.dailyAdsCount += 1;
    
    await user.save();
    res.json({ ok: true, lucky, coins: user.coins, spinsLeft: user.spinsLeft });
});

// API Rút tiền (1000 xu = 1 VNĐ)
app.post('/api/withdraw', async (req, res) => {
    const { id, amountVnd, method, address } = req.body;
    const user = await User.findOne({ id });
    const cost = parseInt(amountVnd) * 1000;

    if (!user || user.coins < cost) return res.json({ ok: false, msg: "Số dư xu không đủ!" });

    user.coins -= cost;
    await user.save();

    const msg = `💰 *YÊU CẦU RÚT TIỀN*\n👤: ${user.first_name}\n💵: ${parseInt(amountVnd).toLocaleString()} VNĐ\n🏦: ${method}\n📍: \`${address}\``;
    bot.telegram.sendMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });
    res.json({ ok: true });
});

// --- CHỨC NĂNG BACKUP EXCEL QUA BOT ---
bot.command('export', async (ctx) => {
    if (ctx.from.id !== parseInt(ADMIN_ID)) return;
    const users = await User.find().lean();
    const ws = XLSX.utils.json_to_sheet(users);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    ctx.replyWithDocument({ source: buf, filename: 'User_Backup.xlsx' });
});

bot.start((ctx) => {
    ctx.reply(`Chào mừng ${ctx.from.first_name}!`, Markup.inlineKeyboard([
        [Markup.button.webApp("🚀 VÀO APP KIẾM TIỀN", MY_APP_LINK)]
    ]));
});

// Anti-sleep: Tự động gọi link app mỗi 5p để Render không tắt
setInterval(() => {
    if (MY_APP_LINK) {
        require('https').get(MY_APP_LINK, (res) => {}).on('error', (e) => {});
    }
}, 300000);

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("🚀 Server is running!"));
