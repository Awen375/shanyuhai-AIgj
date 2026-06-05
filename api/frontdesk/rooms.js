import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    const { password } = req.query;
    const savedPwd = await redis.get('config:frontdesk_password') || '1234';
    if (password !== savedPwd) return res.status(403).json({ error: '密码错误' });

    const keys = await redis.keys('room:*');
    const rooms = [];
    for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
            const room = typeof data === 'string' ? JSON.parse(data) : data;
            rooms.push({
                id: key.replace('room:', ''),
                name: room.name || `${key.replace('room:', '')}号房`,
                token: room.token || ''
            });
        }
    }
    rooms.sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
    return res.status(200).json({ rooms });
}
