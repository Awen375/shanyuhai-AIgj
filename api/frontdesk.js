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
    const { password } = req.query;
    if (!password) return res.status(400).json({ valid: false, error: '缺少密码' });
    if (!(await checkPassword(password))) return res.status(200).json({ valid: false });

    // 主数据接口：今日使用房间 + 未处理通知（分类）
    if (req.method === 'GET' && !req.query.type && !req.query.history) {
        const today = new Date().toISOString().slice(0, 10);
        const chatKeys = await redis.keys('chat:*');
        const rooms = new Set();
        for (const key of chatKeys) {
            const raw = await redis.get(key);
            if (raw) {
                try {
                    const log = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    if (log.time && log.time.startsWith(today)) rooms.add(log.room || '未知');
                } catch (e) {}
            }
        }

        const notifKeys = await redis.keys('notification:*');
        const notifications = [];
        for (const key of notifKeys) {
            const raw = await redis.get(key);
            if (raw) {
                const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (n.status === 'pending') {
                    notifications.push({ id: key.replace('notification:', ''), ...n });
                }
            }
        }

        return res.status(200).json({
            valid: true,
            todayRooms: Array.from(rooms),
            notifications
        });
    }

    // 获取某类型通知列表
    if (req.query.type && req.method === 'GET' && !req.query.history) {
        const type = req.query.type;
        const keys = await redis.keys('notification:*');
        const list = [];
        for (const key of keys) {
            const raw = await redis.get(key);
            if (raw) {
                const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (n.status === 'pending' && n.type === type) {
                    list.push({ id: key.replace('notification:', ''), room: n.room, question: n.question, time: n.time });
                }
            }
        }
        return res.status(200).json({ notifications: list });
    }

    // 处理完成
    if (req.method === 'POST' && req.url.includes('/handle')) {
        const { id, password } = req.body;
        if (!(await checkPassword(password))) return res.status(403).json({ error: '密码错误' });
        const raw = await redis.get(`notification:${id}`);
        if (!raw) return res.status(404).json({ error: '不存在' });
        const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
        n.status = 'done';
        n.resolvedAt = new Date().toISOString();
        await redis.set(`notification:${id}`, JSON.stringify(n));
        return res.status(200).json({ success: true });
    }

    // 历史记录
    if (req.query.history) {
        const type = req.query.type;
        const keys = await redis.keys('notification:*');
        const history = [];
        for (const key of keys) {
            const raw = await redis.get(key);
            if (raw) {
                const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (n.status === 'done' && n.type === type) {
                    history.push({ id: key.replace('notification:', ''), room: n.room, question: n.question, resolvedAt: n.resolvedAt });
                }
            }
        }
        history.sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
        return res.status(200).json({ history });
    }

    res.status(404).json({ error: '接口不存在' });
}
