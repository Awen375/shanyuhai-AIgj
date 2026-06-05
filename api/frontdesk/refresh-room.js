import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });

    const { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ error: '缺少参数' });

    const savedPwd = await redis.get('config:frontdesk_password') || '1234';
    if (password !== savedPwd) return res.status(403).json({ error: '密码错误' });

    const existing = await redis.get(`room:${id}`);
    if (!existing) return res.status(404).json({ error: '房间不存在' });

    const room = typeof existing === 'string' ? JSON.parse(existing) : existing;
    const newToken = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    room.token = newToken;
    room.updatedAt = new Date().toISOString();
    await redis.set(`room:${id}`, JSON.stringify(room));

    return res.status(200).json({ success: true, token: newToken });
}
