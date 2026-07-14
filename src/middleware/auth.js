const crypto = require('crypto');

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing Auth Header.' });
  }

  const [type, initDataRaw] = authHeader.split(' ');
  if (type !== 'tma' || !initDataRaw) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Auth Format.' });
  }

  try {
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const params = Array.from(urlParams.entries());
    params.sort((a, b) => a[0].localeCompare(b[0]));

    const dataCheckString = params.map(([key, value]) => `${key}=${value}`).join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ success: false, error: 'Access Denied: Hash verification failed.' });
    }

    const userRaw = urlParams.get('user');
    if (!userRaw) {
      return res.status(400).json({ success: false, error: 'Access Denied: Missing user data.' });
    }

    req.tgUser = JSON.parse(userRaw);
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error during auth.' });
  }
};
