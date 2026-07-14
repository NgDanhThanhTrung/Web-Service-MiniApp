const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Hằng số Tokenomics
const REWARD_PER_AD = 400000;         // Thưởng 1 Ads view = 400,000 Xu (~20 VNĐ)
const BUY_DIAMOND_RATE = 2000;        // 1 Diamond = 2,000 Xu Thường
const SELL_DIAMOND_RATE = 1500;       // 1 Diamond = 1,500 Xu Thường (Spread 25%)
const MIN_WITHDRAW_COINS = 4000000;   // Hạn mức rút tối thiểu 4,000,000 Xu (~200 VNĐ)
const REQUIRED_ADS_FOR_WITHDRAW = 15; // Phải xem ít nhất 15 Ads/ngày
const WITHDRAW_TAX_RATE = 0.10;       // 10% phí rút tiền (Đốt cháy hoàn toàn)
const MAX_MINING_SECONDS = 21600;     // Giới hạn 1 phiên đào tối đa 6 giờ
const REFERRAL_REWARD_COINS = 1000000; // 1,000,000 Xu Thường cho Ref thành công (khi Ref xem đủ 15 Ads)

// Hàm hỗ trợ tính toán đồng bộ sản lượng tích lũy thực tế
function getMiningProgress(user) {
  if (!user.isMining || !user.miningStartedAt) {
    return { earned: 0, secondsElapsed: 0 };
  }

  const now = new Date();
  const startedAt = new Date(user.miningStartedAt);
  let secondsElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

  if (secondsElapsed < 0) secondsElapsed = 0;
  
  // Chặn cứng giới hạn phiên đào 6 giờ để chống treo máy ảo, chống bot rác
  if (secondsElapsed > MAX_MINING_SECONDS) {
    secondsElapsed = MAX_MINING_SECONDS;
  }

  const earned = parseFloat((secondsElapsed * user.miningRate).toFixed(4));
  return { earned, secondsElapsed };
}

/**
 * 1. API: Lấy thông tin tài khoản người chơi
 */
router.get('/user/profile', async (req, res) => {
  try {
    const telegramId = req.tgUser.id;
    let user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    // Reset chỉ số quảng cáo xem trong ngày nếu bước sang ngày mới
    if (user.lastActiveDay !== todayStr) {
      user.adsWatchedToday = 0;
      user.lastActiveDay = todayStr;
      await user.save();
    }

    const { earned } = getMiningProgress(user);

    res.json({
      success: true,
      data: {
        telegramId: user.telegramId,
        username: user.username,
        totalCoins: user.totalCoins,
        diamonds: user.diamonds,
        level: user.level,
        isMining: user.isMining,
        miningStartedAt: user.miningStartedAt,
        miningRate: user.miningRate,
        adsWatchedToday: user.adsWatchedToday,
        pendingCoins: earned
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. API: Khởi động máy đào (Start Mining)
 */
router.post('/start-mining', async (req, res) => {
  try {
    const telegramId = req.tgUser.id;
    const user = await User.findOne({ telegramId });

    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    if (user.isMining) return res.status(400).json({ success: false, error: 'Máy đào hiện đang hoạt động rồi.' });

    user.isMining = true;
    user.miningStartedAt = new Date();
    await user.save();

    res.json({ success: true, message: 'Đã kích hoạt máy đào mỏ nông trại!', data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. API: Thu hoạch Xu (`/api/harvest`)
 */
router.post('/harvest', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const telegramId = req.tgUser.id;
    const user = await User.findOne({ telegramId }).session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (!user.isMining) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'Máy đào đang không hoạt động.' });
    }

    const { earned, secondsElapsed } = getMiningProgress(user);

    if (secondsElapsed < 5) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'Bạn phải chờ tối thiểu 5 giây để tiến hành thu hoạch.' });
    }

    // Kết thúc phiên đào và lưu chuyển dòng tiền
    user.totalCoins += earned;
    user.isMining = false;
    user.miningStartedAt = null;

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Bạn đã thu hoạch thành công +${earned.toLocaleString()} Xu Thường!`,
      data: user
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. API: Mua Kim Cương bằng Xu Thường (Spread 25% làm cơ chế đốt xu)
 */
router.post('/exchange/buy-diamonds', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const telegramId = req.tgUser.id;
    const { amount } = req.body;
    const qty = parseInt(amount, 10);

    if (isNaN(qty) || qty <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: 'Số lượng mua không hợp lệ.' });
    }

    const user = await User.findOne({ telegramId }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const cost = qty * BUY_DIAMOND_RATE;
    if (user.totalCoins < cost) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: `Số dư không đủ! Cần có ${cost.toLocaleString()} Xu để đổi lấy ${qty} Kim cương.` });
    }

    user.totalCoins -= cost;
    user.diamonds += qty;

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: `Thực hiện đổi thành công +${qty} Kim Cương!`, data: user });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. API: Nâng cấp máy đào (`/api/upgrade`)
 * Áp dụng công thức tăng giá lũy tiến và hiệu suất mỏ giảm dần (Diminishing Returns)
 */
router.post('/upgrade', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const telegramId = req.tgUser.id;
    const user = await User.findOne({ telegramId }).session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Nếu mỏ đang hoạt động, tiến hành thu hoạch tích lũy trước để không làm mất phần xu tích lũy cũ
    if (user.isMining) {
      const { earned } = getMiningProgress(user);
      user.totalCoins += earned;
      user.isMining = false;
      user.miningStartedAt = null;
    }

    const currentLevel = user.level;
    // Công thức tính chi phí Kim Cương lũy tiến: 100 * (Level ^ 1.8)
    const costDiamonds = Math.floor(100 * Math.pow(currentLevel, 1.8));

    if (user.diamonds < costDiamonds) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: `Không đủ Kim Cương nâng cấp! Cần có: ${costDiamonds} Kim Cương.` });
    }

    user.diamonds -= costDiamonds;
    user.level += 1;

    // Công thức tăng sản lượng mỏ giảm dần: miningRate = 12.0 + (12.0 * Level ^ 0.6)
    const baseRate = 12.0;
    user.miningRate = baseRate + parseFloat((baseRate * Math.pow(user.level, 0.6)).toFixed(4));

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: `Nâng cấp máy đào thành công lên Cấp ${user.level}!`, data: user });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. API: Callback Adsgram hoàn thành xem quảng cáo nhận thưởng
 * Đồng thời tích hợp cơ chế THƯỞNG GIỚI THIỆU CHỐNG CLONE
 */
router.post('/ads-reward', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const telegramId = req.tgUser.id;
    const user = await User.findOne({ telegramId }).session(session);

    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // 1. Cộng thưởng quảng cáo thông thường
    user.totalCoins += REWARD_PER_AD;
    user.adsWatchedToday += 1;

    // 2. LOGIC THƯỞNG REFERRAL CHỐNG CLONE NICK ẢO:
    // Kiểm tra xem user này có được người khác giới thiệu không
    if (user.referredBy && !user.referralRewardClaimed) {
      // Điều kiện kích hoạt: Tài khoản được mời (B) phải xem đủ tối thiểu 15 quảng cáo đầu tiên kể từ khi đăng ký
      if (user.adsWatchedToday >= 15) {
        const referrer = await User.findOne({ telegramId: user.referredBy }).session(session);
        if (referrer) {
          referrer.totalCoins += REFERRAL_REWARD_COINS; // Cộng thưởng 1,000,000 Xu cho người mời (A)
          await referrer.save({ session });
          console.log(`[REFERRAL CLAIMED] User ${user.referredBy} nhận được ${REFERRAL_REWARD_COINS} Xu nhờ giới thiệu thành công ${telegramId}`);
        }
        user.referralRewardClaimed = true; // Chốt trạng thái, chỉ nhận duy nhất 1 lần
      }
    }

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({ 
      success: true, 
      message: `Xem quảng cáo thành công! Nhận +${REWARD_PER_AD.toLocaleString()} Xu Thường.`, 
      data: user 
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. API: Rút Tiền Về Ví (`/api/withdraw`)
 * Chặn: adsWatchedToday < 15, số dư nhỏ hơn mức tối thiểu, khấu trừ thêm 10% thuế rút tiền để tiêu hủy
 */
router.post('/withdraw', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const telegramId = req.tgUser.id;
    const { amount } = req.body;
    const withdrawAmount = parseInt(amount, 10);

    if (isNaN(withdrawAmount) || withdrawAmount < MIN_WITHDRAW_COINS) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: `Số lượng rút tối thiểu là ${MIN_WITHDRAW_COINS.toLocaleString()} Xu.` });
    }

    const user = await User.findOne({ telegramId }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Kiểm tra điều kiện quảng cáo đã xem hôm nay
    if (user.adsWatchedToday < REQUIRED_ADS_FOR_WITHDRAW) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false, 
        error: `Rút tiền thất bại! Bạn cần xem ít nhất ${REQUIRED_ADS_FOR_WITHDRAW} quảng cáo hôm nay để kích hoạt rút. (Hiện có: ${user.adsWatchedToday}/${REQUIRED_ADS_FOR_WITHDRAW})` 
      });
    }

    // Kiểm tra số dư Xu Thường hiện hữu
    if (user.totalCoins < withdrawAmount) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, error: `Số dư không đủ! Bạn hiện có ${user.totalCoins.toLocaleString()} Xu.` });
    }

    // Áp dụng thuế rút tiền 10% để tiêu hủy trực tiếp khỏi lưu thông hệ thống
    const taxCoins = Math.floor(withdrawAmount * WITHDRAW_TAX_RATE);
    const payoutAmount = withdrawAmount - taxCoins;

    user.totalCoins -= withdrawAmount;

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    console.log(`[WITHDRAW ORDER] TelegramId: ${telegramId} rút ${withdrawAmount} Xu. Thuế đã đốt: ${taxCoins} Xu. Thực chuyển đến ví: ${payoutAmount} Xu.`);

    res.json({
      success: true,
      message: `Yêu cầu rút tiền thành công! 10% thuế suất (${taxCoins.toLocaleString()} Xu) đã được đốt hoàn toàn để kiểm soát lạm phát.`,
      data: {
        withdrawn: withdrawAmount,
        burned: taxCoins,
        netPayout: payoutAmount,
        remainingCoins: user.totalCoins
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
