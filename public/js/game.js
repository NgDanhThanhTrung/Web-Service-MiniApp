const tg = window.Telegram.WebApp;
tg.expand();

const initData = tg.initData;
let profile = null;
let tickTimer = null;

// Khởi tạo SDK Adsgram (Thay thế khối blockId bằng ID từ tài khoản Adsgram của bạn)
const AdController = window.Adsgram ? window.Adsgram.init({ blockId: "your-adsgram-block-id-here" }) : null;

// Khai báo ánh xạ DOM
const userDisplay = document.getElementById('user-display');
const levelTag = document.getElementById('level-tag');
const coinsBal = document.getElementById('coins-bal');
const diamondsBal = document.getElementById('diamonds-bal');
const rateVal = document.getElementById('rate-val');
const pendingVal = document.getElementById('pending-val');
const miningToggleBtn = document.getElementById('mining-toggle-btn');
const harvestBtn = document.getElementById('harvest-btn');
const buyDiamondBtn = document.getElementById('buy-diamond-btn');
const upgradeBtn = document.getElementById('upgrade-btn');
const upCost = document.getElementById('up-cost');
const adsBtn = document.getElementById('ads-btn');
const withdrawBtn = document.getElementById('withdraw-btn');
const adsToday = document.getElementById('ads-today');

// Hàm giao tiếp API chuẩn hoá bảo mật
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `tma ${initData}`
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(endpoint, options);
        const resJson = await response.json();
        if (!resJson.success) {
            tg.showAlert(`Thông báo: ${resJson.error}`);
            return null;
        }
        return resJson;
    } catch (err) {
        tg.showAlert('Mất kết nối tới máy chủ nông trại.');
        return null;
    }
}

// Đồng bộ trạng thái giao diện UI
function updateUI(user) {
    profile = user;
    userDisplay.innerText = `🌾 Nông Dân: ${user.username}`;
    levelTag.innerText = `Máy Đào Cấp: ${user.level}`;
    coinsBal.innerText = user.totalCoins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    diamondsBal.innerText = user.diamonds;
    rateVal.innerText = user.miningRate;
    adsToday.innerText = user.adsWatchedToday;

    const nextUpCost = Math.floor(100 * Math.pow(user.level, 1.8));
    upCost.innerText = nextUpCost;

    if (tickTimer) clearInterval(tickTimer);

    if (user.isMining && user.miningStartedAt) {
        miningToggleBtn.style.display = 'none';
        harvestBtn.style.display = 'block';

        // Tạo vòng lặp hiển thị tăng trưởng tài nguyên liên tục ở phía Client
        tickTimer = setInterval(() => {
            const now = new Date();
            const start = new Date(profile.miningStartedAt);
            let diffSec = Math.floor((now.getTime() - start.getTime()) / 1000);
            
            if (diffSec > 21600) diffSec = 21600; // Giới hạn giao diện hiển thị 6 giờ tương ứng server
            const progress = diffSec * profile.miningRate;
            pendingVal.innerText = progress.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        }, 100);
    } else {
        miningToggleBtn.style.display = 'block';
        harvestBtn.style.display = 'none';
        pendingVal.innerText = "0.0000";
    }
}

async function loadProfile() {
    const response = await apiCall('/api/user/profile');
    if (response) updateUI(response.data);
}

// Đăng ký tương tác sự kiện
miningToggleBtn.addEventListener('click', async () => {
    tg.HapticFeedback.impactOccurred('light');
    const res = await apiCall('/api/start-mining', 'POST');
    if (res) updateUI(res.data);
});

harvestBtn.addEventListener('click', async () => {
    tg.HapticFeedback.impactOccurred('medium');
    const res = await apiCall('/api/harvest', 'POST');
    if (res) {
        tg.showPopup({ title: 'Thành công', message: res.message });
        updateUI(res.data);
    }
});

buyDiamondBtn.addEventListener('click', async () => {
    tg.HapticFeedback.impactOccurred('light');
    const res = await apiCall('/api/exchange/buy-diamonds', 'POST', { amount: 10 });
    if (res) {
        tg.showPopup({ title: 'Thành công', message: res.message });
        updateUI(res.data);
    }
});

upgradeBtn.addEventListener('click', async () => {
    tg.HapticFeedback.impactOccurred('heavy');
    const res = await apiCall('/api/upgrade', 'POST');
    if (res) {
        tg.showPopup({ title: 'Thành công', message: res.message });
        updateUI(res.data);
    }
});

adsBtn.addEventListener('click', () => {
    if (!AdController) {
        tg.showAlert('Mạng lưới Adsgram đang tải hoặc bị chặn.');
        return;
    }
    AdController.show().then(async () => {
        const res = await apiCall('/api/ads-reward', 'POST');
        if (res) {
            tg.showPopup({ title: 'Nhận Thưởng', message: res.message });
            updateUI(res.data);
        }
    }).catch((e) => {
        console.warn('Hủy quảng cáo hoặc gặp lỗi:', e);
        tg.showAlert('Bạn cần xem hết video quảng cáo để có thể nhận phần thưởng.');
    });
});

withdrawBtn.addEventListener('click', () => {
    tg.showPrompt('Nhập số lượng Xu Thường muốn rút (Tối thiểu 4,000,000 Xu):', async (amount) => {
        const num = parseInt(amount, 10);
        if (isNaN(num) || num < 4000000) {
            tg.showAlert('Số lượng rút không hợp lệ hoặc thấp hơn hạn mức.');
            return;
        }
        const res = await apiCall('/api/withdraw', 'POST', { amount: num });
        if (res) {
            tg.showPopup({ title: 'Thanh toán', message: res.message });
            loadProfile();
        }
    });
});

// Khởi chạy
loadProfile();
