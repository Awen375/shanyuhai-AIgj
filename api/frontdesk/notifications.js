import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function checkPassword(password) {
    const saved = await redis.get('config:frontdesk_password') || '1234';
    return password === saved;
}

export default async function handler(req, res) {
    const { password } = req.method === 'GET' ? req.query : req.body;
    if (!password || !(await checkPassword(password))) {
        return res.status(403).json({ error: '密码错误' });
    }

    if (req.method === 'GET') {
        const { type, history } = req.query;
        const keys = await redis.keys('notification:*');
        const list = [];

        for (const key of keys) {
            const raw = await redis.get(key);
            if (!raw) continue;
            const n = typeof raw === 'string' ? JSON.parse(raw) : raw;

            if (history === '1' && n.status === 'done') {
                // 如果指定了type，只返回该类型；否则返回所有已处理
                if (!type || n.type === type) {
                    list.push({
                        id: key.replace('notification:', ''),
                        room: n.room,
                        question: n.question,
                        resolvedAt: n.resolvedAt,
                        type: n.type
                    });
                }
            } else if (!history && n.status === 'pending' && n.type === type) {
                list.push({
                    id: key.replace('notification:', ''),
                    room: n.room,
                    question: n.question,
                    time: n.time
                });
            }
        }

        list.sort((a, b) => new Date(b.resolvedAt || b.time) - new Date(a.resolvedAt || a.time));
        return res.status(200).json(history === '1' ? { history: list } : { notifications: list });
    }

    if (req.method === 'POST') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: '缺少通知ID' });
        const raw = await redis.get(`notification:${id}`);
        if (!raw) return res.status(404).json({ error: '通知不存在' });
        const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
        n.status = 'done';
        n.resolvedAt = new Date().toISOString();
        await redis.set(`notification:${id}`, JSON.stringify(n));
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: '方法不允许' });
}
