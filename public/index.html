<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Siêu Cấp Kiếm Xu</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script src="https://sad.adsgram.ai/js/sad.min.js"></script>
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body>
    <div id="app">
        <header class="header">
            <div class="balance-card">
                <small>TỔNG TÀI SẢN (1000 XU = 1 VNĐ)</small>
                <h1 id="b-coins">0</h1>
                <p id="b-vnd">≈ 0 VNĐ</p>
            </div>
        </header>

        <div class="tabs">
            <button class="tab-btn active" onclick="openTab('play')">🎡 KIẾM XU</button>
            <button class="tab-btn" onclick="openTab('ref')">👥 MỜI BẠN</button>
            <button class="tab-btn" onclick="openTab('bank')">🏦 RÚT TIỀN</button>
        </div>

        <main class="main">
            <div id="play" class="tab-content active">
                <div class="stats-row">
                    <div class="stat">Lượt Free: <b id="s-free">0</b></div>
                    <div class="stat">Ads: <b id="s-ads">0/15</b></div>
                </div>
                <button class="btn-main" onclick="claim(false)">🎁 NHẬN XU FREE</button>
                <button class="btn-ads" onclick="showAds()">📺 XEM QC (RANDOM 500-50K)</button>
            </div>

            <div id="ref" class="tab-content">
                <div class="ref-box">
                    <h3>👥 Mời Bạn Nhận 10.000 Xu</h3>
                    <p>Gửi link cho bạn bè, bạn nhận 10k xu, bạn bè nhận 2 lượt free ngay khi vào app.</p>
                    <input type="text" id="ref-link" readonly>
                    <button class="btn-copy" onclick="copyLink()">SAO CHÉP LINK</button>
                </div>
            </div>

            <div id="bank" class="tab-content">
                <div class="withdraw-form">
                    <input type="number" id="w-amount" placeholder="Số tiền VNĐ (VD: 20000)">
                    <select id="w-method">
                        <option value="MoMo">Ví MoMo</option>
                        <option value="Ngân hàng">Chuyển khoản (ATM)</option>
                        <option value="Thẻ cào">Thẻ cào (Viettel/Mobi)</option>
                    </select>
                    <input type="text" id="w-info" placeholder="SĐT MoMo / Số tài khoản / Nhà mạng">
                    <button class="btn-confirm" onclick="requestWithdraw()">GỬI YÊU CẦU</button>
                </div>
            </div>
        </main>
    </div>

    <script>
        const tg = window.Telegram.WebApp;
        const user = tg.initDataUnsafe.user;
        let adController;

        async function init() {
            const cfg = await (await fetch('/api/config')).json();
            
            // Logic Adsgram: URL chứa substring [userId] thông qua params
            if (window.Adsgram) {
                adController = window.Adsgram.init({ 
                    blockId: cfg.adsgramId,
                    params: { userId: user.id.toString() } // Adsgram sẽ tự động thêm vào URL
                });
            }
            updateUI();
        }

        async function updateUI() {
            const res = await fetch('/api/status', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    telegramId: user.id.toString(), 
                    username: user.username, 
                    name: user.first_name,
                    refId: tg.initDataUnsafe.start_param
                })
            });
            const d = await res.json();
            document.getElementById('b-coins').innerText = d.totalCoins.toLocaleString();
            document.getElementById('b-vnd').innerText = `≈ ${(d.totalCoins/1000).toLocaleString()} VNĐ`;
            document.getElementById('s-free').innerText = d.spinsLeft;
            document.getElementById('s-ads').innerText = d.adsWatchedToday + '/15';
            document.getElementById('ref-link').value = `https://t.me/${(await(await fetch('/api/config')).json()).botUsername}/app?startapp=${user.id}`;
        }

        async function claim(isAds) {
            tg.HapticFeedback.impactOccurred('medium');
            const res = await fetch('/api/claim', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ telegramId: user.id.toString(), isAds })
            });
            const r = await res.json();
            if (r.success) {
                tg.showAlert(`🎉 Chúc mừng! Bạn nhận được ${r.lucky.toLocaleString()} xu!`);
                updateUI();
            } else tg.showAlert(r.message);
        }

        function showAds() {
            if (!adController) return tg.showAlert("QC chưa sẵn sàng");
            adController.show().then(() => claim(true)).catch(() => tg.showAlert("Xem hết QC để nhận xu!"));
        }

        async function requestWithdraw() {
            const amount = document.getElementById('w-amount').value;
            const method = document.getElementById('w-method').value;
            const info = document.getElementById('w-info').value;
            if(!amount || !info) return tg.showAlert("Vui lòng điền đủ!");

            const res = await fetch('/api/withdraw', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ telegramId: user.id.toString(), amountVnd: amount, method, details: info })
            });
            const r = await res.json();
            if(r.success) {
                tg.showAlert("✅ Gửi yêu cầu rút thành công! Admin sẽ duyệt sớm.");
                updateUI();
            } else tg.showAlert(r.message);
        }

        function openTab(id) {
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            event.currentTarget.classList.add('active');
        }

        function copyLink() {
            const input = document.getElementById('ref-link');
            input.select();
            document.execCommand('copy');
            tg.showAlert("Đã copy link mời!");
        }

        init(); tg.expand();
    </script>
</body>
</html>
