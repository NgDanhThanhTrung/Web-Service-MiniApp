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
        blockId: ADSGRAM_BLOCK_ID || "30869", 
        botUser: BOT_USERNAME 
    });
});

app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            // CẬP NHẬT: Khởi tạo 5 lượt quay cho người dùng mới
            user = new User({ 
                id, first_name, username, 
                lastActiveDate: today, 
                spinsLeft: 5, 
                adsWatched: 0,
                coins: 0
            });

            if (start_param && parseInt(start_param) !== id) {
                const inviter = await User.findOne({ id: parseInt(start_param) });
                if (inviter) {
                    inviter.coins += 100000;
                    inviter.refs = (inviter.refs || 0) + 1;
                    await inviter.save();
                }
            }
            await user.save();
        } else if (user.lastActiveDate !== today) {
            // CẬP NHẬT: Hồi 5 lượt quay mỗi ngày
            user.spinsLeft = 5;
            user.lastActiveDate = today;
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json(e); }
});

// --- CALLBACK QUẢNG CÁO TỪ ADSGRAM ---
app.get('/api/ads-callback', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).send('Missing userId');

    try {
        const user = await User.findOne({ id: parseInt(userId) });
        if (user) {
            // Thưởng ngẫu nhiên từ 500 đến 50.000 xu
            const lucky = Math.floor(Math.random() * 49501) + 500;
            user.coins += lucky;
            user.adsWatched = (user.adsWatched || 0) + 1;
            await user.save();
            
            console.log(`✅ User ${userId} xem QC thành công. Nhận: ${lucky} xu. Tổng QC: ${user.adsWatched}`);
            res.send('OK'); 
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        console.error('❌ Ads Callback Error:', error);
        res.status(500).send('Server Error');
    }
});

// API thực hiện hành động quay (Spin)
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    try {
        const user = await User.findOne({ id });
        if (!user) return res.json({ ok: false, msg: "Người dùng không tồn tại" });

        if (action === 'spin') {
            if (user.spinsLeft <= 0) return res.json({ ok: false, msg: "Bạn đã hết lượt quay hôm nay!" });
            
            const lucky = Math.floor(Math.random() * 49501) + 500;
            user.coins += lucky;
            user.spinsLeft -= 1;
            await user.save();
            return res.json({ ok: true, lucky });
        }
        res.json({ ok: false, msg: "Hành động không hợp lệ" });
    } catch (e) {
        res.json({ ok: false, msg: "Lỗi hệ thống" });
    }
});

// API Rút tiền
app.post('/api/withdraw', async (req, res) => {
    const { id, amountXu, method, address } = req.body;
    try {
        const user = await User.findOne({ id });
        if (!user) return res.json({ ok: false, msg: "Lỗi xác thực người dùng" });

        // Kiểm tra điều kiện 5 quảng cáo
        const currentAds = user.adsWatched || 0;
        if (currentAds < 5) {
            return res.json({ ok: false, msg: `Bạn cần xem đủ 5 quảng cáo để rút tiền (Hiện tại: ${currentAds}/5)` });
        }

        // Kiểm tra số dư và mức rút tối thiểu
        if (!amountXu || amountXu < 300000) {
            return res.json({ ok: false, msg: "Hạn mức rút tối thiểu là 300.000 XU" });
        }

        if (user.coins < amountXu) {
            return res.json({ ok: false, msg: "Số dư tài khoản không đủ để thực hiện lệnh này" });
        }

        // Trừ tiền và tạo lệnh rút
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
    } catch (e) {
        res.json({ ok: false, msg: "Lỗi trong quá trình xử lý rút tiền" });
    }
});

// --- ADMIN API ---

app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    try {
        const users = await User.find().sort({ coins: -1 }).limit(100);
        const withdraws = await Withdraw.find().sort({ createdAt: -1 });
        res.json({ users, withdraws });
    } catch (e) { res.status(500).send("Admin Data Error"); }
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.sendStatus(403);
    try {
        await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Đã thanh toán' });
        res.json({ ok: true });
    } catch (e) { res.status(500).send("Approve Error"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
