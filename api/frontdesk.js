import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    const { password } = req.query;
    if (!password) return res.status(400).json({ valid: false, error: '缺少密码' });

    const savedPwd = await redis.get('config:frontdesk_password') || '1234';
    if (password !== savedPwd) return res.status(200).json({ valid: false });

    // 获取今日活跃房间
    const today = new Date().toISOString().slice(0, 10);
    const keys = await redis.keys('chat:*');
    const roomsSet = new Set();
    for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
            try {
                const log = typeof data === 'string' ? JSON.parse(data) : data;
                if (log.time && log.time.startsWith(today)) {
                    roomsSet.add(log.room || '未知');
                }
            } catch (e) {}
        }
    }

    // 获取待处理通知
    const notifKeys = await redis.keys('notification:*');
    const notifications = [];
    let notifCount = 0;
    for (const key of notifKeys) {
        const data = await redis.get(key);
        if (data) {
            const notif = typeof data === 'string' ? JSON.parse(data) : data;
            if (notif.status === 'pending') {
                notifCount++;
                notifications.push(notif);
            }
        }
    }

    return res.status(200).json({
        valid: true,
        rooms: Array.from(roomsSet),
        notifCount,
        notifications
    });
}
