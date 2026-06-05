import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    const { password } = req.query;
    const savedPwd = await redis.get('config:frontdesk_password') || '1234';
    if (password !== savedPwd) return res.status(403).json({ error: '密码错误' });

    const voice = await redis.get('config:voice') || '';
    return res.status(200).json({ voice });
}
