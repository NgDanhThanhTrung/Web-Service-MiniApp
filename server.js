const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const { ADMIN_PASS, ADSGRAM_BLOCK_ID, BOT_USERNAME, MONGODB_URI } = process.env;

// Kết nối MongoDB
mongoose.connect(MONGODB_URI).then(() => console.log('✅ Hệ thống B-Account đã sẵn sàng'));

const User = require('./models/User');

// Cấu trúc dữ liệu Rút tiền mới nhất
const WithdrawSchema = new mongoose.Schema({
    userId: Number,
    name: String,
    amountReq: Number,  // Số lượng (VND hoặc TON)
    unit: String,       // "VND" hoặc "TON"
    coinCost: Number,   // Tổng số xu bị trừ (sau khi quy đổi)
    method: String,     // Ngân hàng, Ví điện tử, TON Wallet
    address: String,    // Thông tin chi tiết
    status: { type: String, default: 'Chờ duyệt' },
    createdAt: { type: Date, default: Date.now }
});
const Withdraw = mongoose.model('Withdraw', WithdrawSchema);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hàm lấy giá TON (Có thể cập nhật thủ công hoặc gọi API)
async function getTonPrice() {
    // Giả sử 1 TON = 180,000 VNĐ. Bạn có thể thay đổi số này theo thị trường.
    return 180000; 
}

// --- API CHO FRONTEND ---

app.get('/api/config', async (req, res) => {
    const tonPrice = await getTonPrice();
    res.json({ 
        blockId: ADSGRAM_BLOCK_ID, 
        botUser: BOT_USERNAME,
        tonPrice: tonPrice 
    });
});

app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            user = new User({ id, first_name, username, lastActiveDate: today, spinsLeft: 10 });
            // Thưởng ref 10.000 xu cho người mời
            if (start_param && parseInt(start_param) !== id) {
                const inviter = await User.findOne({ id: parseInt(start_param) });
                if (inviter) {
                    inviter.coins += 10000;
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
    } catch (e) { res.status(500).send(e); }
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

// Logic Rút tiền: Hạn mức và Quy đổi
app.post('/api/withdraw', async (req, res) => {
    const { id, amountReq, unit, method, address } = req.body;
    const user = await User.findOne({ id });
    const tonPrice = await getTonPrice();

    if (!user) return res.json({ ok: false, msg: "Lỗi người dùng" });

    let coinCost = 0;
    
    // Kiểm tra hạn mức và tính toán xu
    if (unit === 'VND') {
        if (amountReq < 2000) return res.json({ ok: false, msg: "Tối thiểu 2,000đ cho Ngân hàng/Ví" });
        coinCost = amountReq * 1000; // 1000 xu = 1 VNĐ
    } else if (unit === 'TON') {
        if (amountReq < 0.0003) return res.json({ ok: false, msg: "Tối thiểu 0.0003 TON" });
        // Quy đổi: TON -> VNĐ -> Xu
        coinCost = Math.round(amountReq * tonPrice * 1000);
    }

    if (user.coins < coinCost) {
        return res.json({ ok: false, msg: `Bạn cần ${coinCost.toLocaleString()} xu để rút đơn này!` });
    }

    // Trừ xu và lưu lịch sử
    user.coins -= coinCost;
    await user.save();

    const newWithdraw = new Withdraw({
        userId: id,
        name: user.first_name,
        amountReq,
        unit,
        coinCost,
        method,
        address
    });
    await newWithdraw.save();
    
    res.json({ ok: true });
});

// --- API CHO ADMIN (Lấy trực tiếp từ Mongo) ---

app.get('/api/admin/all-data', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.sendStatus(403);
    // Lấy top 100 user và toàn bộ lịch sử rút tiền
    const users = await User.find().sort({ coins: -1 }).limit(100);
    const withdraws = await Withdraw.find().sort({ createdAt: -1 });
    res.json({ users, withdraws });
});

app.post('/api/admin/approve-withdraw', async (req, res) => {
    if (req.body.pass !== ADMIN_PASS) return res.sendStatus(403);
    await Withdraw.findByIdAndUpdate(req.body.id, { status: 'Đã thanh toán' });
    res.json({ ok: true });
});

app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
