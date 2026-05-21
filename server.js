const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');

const app = express();

// Các biến môi trường còn lại từ Render
const { 
    ADMIN_PASS, 
    ADSGRAM_BLOCK_ID, 
    BOT_USERNAME, 
    MONGODB_URI 
} = process.env;

mongoose.connect(MONGODB_URI).then(() => console.log('✅ DB Connected (No Bot Mode)'));

const User = require('./models/User');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Config cho Frontend
app.get('/api/config', (req, res) => {
    res.json({ 
        blockId: ADSGRAM_BLOCK_ID, 
        botUser: BOT_USERNAME 
    });
});

// Trang quản trị dành cho Tài khoản B
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

app.get('/api/admin/users', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.status(403).send("Sai mật khẩu");
    const users = await User.find().sort({ coins: -1 });
    res.json(users);
});

// API Đồng bộ người dùng & Referral
app.post('/api/user-status', async (req, res) => {
    const { id, first_name, username, start_param } = req.body;
    try {
        let user = await User.findOne({ id });
        const today = new Date().toISOString().split('T')[0];

        if (!user) {
            user = new User({ id, first_name, username, lastActiveDate: today, spinsLeft: 10 });
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
    } catch (e) { res.status(500).json(e); }
});

// API Quay thưởng / Xem Ads
app.post('/api/action', async (req, res) => {
    const { id, action } = req.body;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ ok: false });

    if (action === 'spin' && user.spinsLeft <= 0) return res.json({ ok: false, msg: "Hết lượt quay!" });

    const lucky = Math.floor(Math.random() * (50000 - 500 + 1)) + 500;
    user.coins += lucky;
    if (action === 'spin') user.spinsLeft -= 1;
    
    await user.save();
    res.json({ ok: true, lucky, coins: user.coins, spinsLeft: user.spinsLeft });
});

// API Rút tiền (Chỉ trừ xu, Admin kiểm tra danh sách qua trang quản trị)
app.post('/api/withdraw', async (req, res) => {
    const { id, amountVnd, method, address } = req.body;
    const user = await User.findOne({ id });
    const cost = parseInt(amountVnd) * 1000;

    if (!user || user.coins < cost) return res.json({ ok: false, msg: "Số dư không đủ!" });

    user.coins -= cost;
    // Lưu thông báo rút tiền vào console log hoặc bạn có thể tạo thêm Model Withdraw nếu cần
    console.log(`[WITHDRAW] User: ${user.first_name} | Amount: ${amountVnd} VNĐ | Info: ${address}`);
    
    await user.save();
    res.json({ ok: true });
});

// Xuất file Excel qua link API (Thay thế cho lệnh Bot)
app.get('/api/admin/export', async (req, res) => {
    if (req.query.pass !== ADMIN_PASS) return res.status(403).send("Sai mật khẩu");
    const users = await User.find().lean();
    const ws = XLSX.utils.json_to_sheet(users);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename=Users.xlsx');
    res.send(buf);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server B-Account running on port ${PORT}`));
