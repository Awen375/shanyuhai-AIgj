import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: '只支持GET' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const room = url.searchParams.get('room');
    const token = url.searchParams.get('token');
    const checkin = url.searchParams.get('checkin');   // 格式 YYYYMMDDHHmm 例 202606071400
    const checkout = url.searchParams.get('checkout'); // 同上

    if (!room || !token) return res.status(400).json({ error: '缺少房间或令牌' });

    try {
        // 验证 token 是否与 Redis 中存储的一致
        const roomData = await redis.get(`room:${room}`);
        if (!roomData) return res.status(200).json({ valid: false, reason: '房间不存在' });
        const saved = typeof roomData === 'string' ? JSON.parse(roomData) : roomData;
        if (saved.token !== token) return res.status(200).json({ valid: false, reason: '令牌无效' });

        // 如果带有入住/退房时间，则进行时效验证
        if (checkin && checkout) {
            const now = new Date();
            const beijingNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
            const formatTime = (str) => {
                const year = str.substring(0,4);
                const month = str.substring(4,6) - 1;
                const day = str.substring(6,8);
                const hour = str.substring(8,10);
                const min = str.substring(10,12);
                return new Date(year, month, day, hour, min);
            };
            const checkinTime = formatTime(checkin);
            const checkoutTime = formatTime(checkout);

            if (beijingNow < checkinTime) {
                return res.status(200).json({
                    valid: false,
                    reason: 'waiting',
                    message: `您的AI专属管家等待分配，分配时间为：${checkinTime.toLocaleString('zh-CN', { hour12: false })}`
                });
            }
            if (beijingNow >= checkoutTime) {
                return res.status(200).json({
                    valid: false,
                    reason: 'expired',
                    message: '您的AI专属管家已过期，很高兴陪您一起度过这场难忘的度假。下次再见，我在山予海永远等您。'
                });
            }
        }

        // 一切正常
        return res.status(200).json({ valid: true });
    } catch (err) {
        return res.status(500).json({ error: '服务错误' });
    }
}
