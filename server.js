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

// Schema Rút tiền: Cập nhật chỉ lưu số XU và thông tin thanh toán
const WithdrawSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    amountXu: Number,    // Số XU yêu cầu rút (Min 300,000)
    method: String,      // Ngân hàng, Ví điện tử, hoặc TON Wallet
    address: String,     // STK hoặc địa chỉ ví
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
        blockId: ADSGRAM_BLOCK_ID, 
        botUser: BOT_USERNAME 
    });
});

app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            // Khởi tạo user mới với 0 adsWatched và 10 spins
            user = new User({ 
                id, first_name, username, 
                lastActiveDate: today, 
                spinsLeft: 10,
                adsWatched: 0 
            });

            // Referral: Tặng 100.000 xu cho người mời
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

app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    const user = await User.findOne({ id });
    if (!user) return res.json({ ok: false });

    // Logic cộng tiền ngẫu nhiên cho cả Spin và Ads
    const lucky = Math.floor(Math.random() * 49501) + 500;
    
    if (action === 'spin') {
        if (user.spinsLeft <= 0) return res.json({ ok: false, msg: "Hết lượt quay" });
        user.spinsLeft -= 1;
    } 
    
    if (action === 'ads') {
        // Cộng dồn số lần xem quảng cáo vào DB
        user.adsWatched = (user.adsWatched || 0) + 1;
    }

    user.coins += lucky;
    await user.save();
    res.json({ ok: true, lucky, adsWatched: user.adsWatched });
});

// Lưu yêu cầu rút tiền với điều kiện: 300k xu + 5 video quảng cáo
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    const user = await User.findOne({ id });

    if (!user) return res.json({ ok: false, msg: "Lỗi người dùng" });

    // 1. Kiểm tra số video quảng cáo đã xem
    if ((user.adsWatched || 0) < 5) {
        return res.json({ ok: false, msg: `Cần xem ít nhất 5 QC (Hiện có: ${user.adsWatched}/5)` });
    }

    // 2. Kiểm tra hạn mức xu tối thiểu (300,000)
    if (amountXu < 300000) {
        return res.json({ ok: false, msg: "Tối thiểu rút 300.000 XU" });
    }

    // 3. Kiểm tra số dư khả dụng
    if (user.coins < amountXu) {
        return res.json({ ok: false, msg: "Số dư xu không đủ" });
    }

    // Trừ tiền và tạo đơn rút
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
