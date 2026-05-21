const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, ADSGRAM_BLOCK_ID, BOT_USERNAME, MONGODB_URI } = process.env;

// Kết nối MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Hệ thống B-Account (No Bot) đã sẵn sàng'))
    .catch(err => console.error('❌ Lỗi kết nối DB:', err));

const User = require('./models/User');

// Schema Rút tiền
const WithdrawSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    amountXu: Number,
    method: String,
    address: String,
    status: { type: String, default: 'Chờ duyệt' },
    createdAt: { type: Date, default: Date.now }
});
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ĐIỀU HƯỚNG GIAO DIỆN ---
app.get(['/', '/app'], (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// --- API FRONTEND ---

app.get('/api/config', (req, res) => {
    res.json({ 
        blockId: ADSGRAM_BLOCK_ID || "30869", // Mặc định ID bạn đã khởi tạo
        botUser: BOT_USERNAME 
    });
});

app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            user = new User({ 
                id, first_name, username, 
                lastActiveDate: today, 
                spinsLeft: 10,
                adsWatched: 0,
                coins: 0
            });

            if (start_param && parseInt(start_param) !== id) {
                const inviter = await User.findOne({ id: parseInt(start_param) });
                if (inviter) {
                    inviter.coins += 100000;
                    inviter.refs += 1;
                    await inviter.save();
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

// --- CALLBACK QUẢNG CÁO TỪ ADSGRAM ---
// Reward URL bạn khai báo trên Adsgram: https://web-service-miniapp.onrender.com/api/ads-callback?userId=[userId]
app.get('/api/ads-callback', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('Missing userId');

    try {
        const user = await User.findOne({ id: parseInt(userId) });
        if (user) {
            // Thưởng ngẫu nhiên khi xem xong QC thành công qua callback
            const lucky = Math.floor(Math.random() * 49501) + 500;
            user.coins += lucky;
            user.adsWatched = (user.adsWatched || 0) + 1;
            await user.save();
            
            console.log(`✅ User ${userId} đã nhận thưởng từ Adsgram Callback`);
            res.send('OK'); // Phản hồi cho Adsgram
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

// API thực hiện hành động quay (Spin)
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    const user = await User.findOne({ id });
    if (!user) return res.json({ ok: false });

    if (action === 'spin') {
        if (user.spinsLeft <= 0) return res.json({ ok: false, msg: "Hết lượt quay" });
        const lucky = Math.floor(Math.random() * 49501) + 500;
        user.coins += lucky;
        user.spinsLeft -= 1;
        await user.save();
        return res.json({ ok: true, lucky });
    }
    
    res.json({ ok: false });
});

// API Rút tiền
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    const user = await User.findOne({ id });

    if (!user) return res.json({ ok: false, msg: "Lỗi người dùng" });

    if ((user.adsWatched || 0) < 5) {
        return res.json({ ok: false, msg: `Cần xem ít nhất 5 QC (Hiện có: ${user.adsWatched}/5)` });
    }

    if (amountXu < 300000) {
        return res.json({ ok: false, msg: "Tối thiểu rút 300.000 XU" });
    }

    if (user.coins < amountXu) {
        return res.json({ ok: false, msg: "Số dư xu không đủ" });
    }

    user.coins -= amountXu;
    await user.save();

    const newRequest = new Withdraw({ 
        userId: id, 
        name: user.first_name, 
        amountXu, 
        method, 
        address 
    });
    await newRequest.save();
    res.json({ ok: true });
});

// --- ADMIN API ---

app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    const users = await User.find().sort({ coins: -1 }).limit(100);
    const withdraws = await Withdraw.find().sort({ createdAt: -1 });
    res.json({ users, withdraws });
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.sendStatus(403);
    await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Đã thanh toán' });
    res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
