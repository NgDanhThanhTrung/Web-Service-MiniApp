const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, ADSGRAM_BLOCK_ID, BOT_USERNAME, MONGODB_URI } = process.env;

mongoose.connect(MONGODB_URI).then(() => console.log('✅ Kết nối MongoDB trực tiếp'));

// Schema Người dùng
const User = require('./models/User');

// Schema Rút tiền (Để điền trực tiếp và lấy từ Mongo)
const WithdrawSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    amountVnd: Number,
    method: String,
    address: String,
    status: { type: String, default: 'Chờ duyệt' },
    createdAt: { type: Date, default: Date.now }
});
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API FRONTEND ---
app.get('/api/config', (req, res) => res.json({ blockId: ADSGRAM_BLOCK_ID, botUser: BOT_USERNAME }));

app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    let user = await User.findOne({ id });
    const today = new Date().toISOString().split('T')[0];

    if (!user) {
        user = new User({ id, first_name, username, lastActiveDate: today, spinsLeft: 10 });
        if (start_param && parseInt(start_param) !== id) {
            const boss = await User.findOne({ id: parseInt(start_param) });
            if (boss) { boss.coins += 10000; boss.refs += 1; await boss.save(); }
        }
        await user.save();
    } else if (user.lastActiveDate !== today) {
        user.spinsLeft = 10; user.lastActiveDate = today; await user.save();
    }
    res.json(user);
});

app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    const user = await User.findOne({ id });
    if (!user || (action === 'spin' && user.spinsLeft <= 0)) return res.json({ ok: false });
    const lucky = Math.floor(Math.random() * 49501) + 500;
    user.coins += lucky;
    if (action === 'spin') user.spinsLeft -= 1;
    await user.save();
    res.json({ ok: true, lucky });
});

// Lưu yêu cầu rút tiền trực tiếp vào Mongo
app.post('/api/withdraw', async (req, res) => {
    const { id, amountVnd, method, address } = req.body;
    const user = await User.findOne({ id });
    if (!user || user.coins < (amountVnd * 1000)) return res.json({ ok: false, msg: "Không đủ xu" });

    user.coins -= (amountVnd * 1000);
    await user.save();

    const newRequest = new Withdraw({ userId: id, name: user.first_name, amountVnd, method, address });
    await newRequest.save();
    res.json({ ok: true });
});

// --- ADMIN PANEL API (Lấy trực tiếp từ Mongo) ---
app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    const users = await User.find().sort({ coins: -1 }).limit(100);
    const withdraws = await Withdraw.find().sort({ createdAt: -1 });
    res.json({ users, withdraws });
});

// Duyệt rút tiền trực tiếp
app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.sendStatus(403);
    await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Đã thanh toán' });
    res.json({ ok: true });
});

app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.listen(process.env.PORT || 3000);
