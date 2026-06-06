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
    const url = new URL(req.url, `http://${req.headers.host}`);
    let action;
    if (req.method === 'POST') {
        action = req.body?.action || url.searchParams.get('action') || 'main';
    } else {
        action = url.searchParams.get('action') || 'main';
    }

    // 心跳接口无需密码验证（或者可以简单验证）
    if (action === 'heartbeat') {
        // 记录心跳，设置过期时间60秒（前台端每30秒发送一次，保证在线）
        await redis.set('heartbeat:frontdesk', '1', { ex: 60 });
        return res.status(200).json({ success: true });
    }

    const password = req.method === 'GET' ? url.searchParams.get('password') : (req.body?.password || '');
    if (!password || !(await checkPassword(password))) {
        return res.status(403).json({ error: '密码错误' });
    }

    try {
        // 主看板
        if (action === 'main' && req.method === 'GET') {
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
                    if (n.status === 'pending') notifications.push({ id: key.replace('notification:', ''), ...n });
                }
            }
            return res.status(200).json({ valid: true, todayRooms: Array.from(rooms), notifications });
        }

        // 通知列表（按类型）
        if (action === 'notifications' && req.method === 'GET') {
            const type = url.searchParams.get('type');
            const history = url.searchParams.get('history');
            const keys = await redis.keys('notification:*');
            const items = [];
            for (const key of keys) {
                const raw = await redis.get(key);
                if (!raw) continue;
                const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (history === '1' && n.status === 'done') {
                    if (!type || n.type === type) items.push({ id: key.replace('notification:', ''), room: n.room, question: n.question, resolvedAt: n.resolvedAt, type: n.type });
                } else if (!history && n.status === 'pending' && n.type === type) {
                    items.push({ id: key.replace('notification:', ''), room: n.room, question: n.question, time: n.time });
                }
            }
            items.sort((a, b) => new Date(b.resolvedAt || b.time) - new Date(a.resolvedAt || a.time));
            return res.status(200).json(history === '1' ? { history: items } : { notifications: items });
        }

        // 处理通知
        if (action === 'notifications' && req.method === 'POST') {
            const { id } = req.body || {};
            if (!id) return res.status(400).json({ error: '缺少通知ID' });
            const raw = await redis.get(`notification:${id}`);
            if (!raw) return res.status(404).json({ error: '通知不存在' });
            const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
            n.status = 'done';
            n.resolvedAt = new Date().toISOString();
            await redis.set(`notification:${id}`, JSON.stringify(n));
            return res.status(200).json({ success: true });
        }

        // 接管房间列表
        if (action === 'takeover_rooms' && req.method === 'GET') {
            const keys = await redis.keys('takeover:*');
            const rooms = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const takeover = typeof data === 'string' ? JSON.parse(data) : data;
                    if (takeover.active) {
                        const r = key.replace('takeover:', '');
                        const msgKeys = await redis.keys(`pending_msg:${r}:*`);
                        rooms.push({ room: r, unread: msgKeys.length, startTime: takeover.startTime });
                    }
                }
            }
            return res.status(200).json({ rooms });
        }

        // 聊天记录
        if (action === 'chat_messages' && req.method === 'GET') {
            const room = url.searchParams.get('room');
            if (!room) return res.status(400).json({ error: '缺少房间号' });
            const chatKeys = await redis.keys('chat:*');
            const messages = [];
            for (const key of chatKeys) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const msg = typeof data === 'string' ? JSON.parse(data) : data;
                        if (msg.room === room && msg.reply) messages.push({ sender: 'ai', text: msg.reply, time: msg.time });
                    } catch (e) {}
                }
            }
            const frontKeys = await redis.keys(`front_msg:${room}:*`);
            for (const key of frontKeys) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const msg = typeof data === 'string' ? JSON.parse(data) : data;
                        messages.push({ sender: msg.sender, text: msg.text, time: msg.time });
                    } catch (e) {}
                }
            }
            const pendingKeys = await redis.keys(`pending_msg:${room}:*`);
            for (const key of pendingKeys) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const msg = typeof data === 'string' ? JSON.parse(data) : data;
                        messages.push({ sender: 'guest', text: msg.text, time: msg.time });
                    } catch (e) {}
                }
            }
            messages.sort((a, b) => new Date(a.time) - new Date(b.time));
            return res.status(200).json({ messages });
        }

        // 发送消息
        if (action === 'send_msg' && req.method === 'POST') {
            const { room, text } = req.body || {};
            if (!room || !text) return res.status(400).json({ error: '缺少参数' });
            await redis.set(`front_msg:${room}:${Date.now()}`, JSON.stringify({ room, sender: 'frontdesk', text, time: new Date().toISOString() }));
            const pendingKeys = await redis.keys(`pending_msg:${room}:*`);
            for (const key of pendingKeys) await redis.del(key);
            return res.status(200).json({ success: true });
        }

        // 结束接管
        if (action === 'end_takeover' && req.method === 'POST') {
            const { room } = req.body || {};
            await redis.del(`takeover:${room}`);
            const endKey = `chat:${Date.now()}:end`;
            await redis.set(endKey, JSON.stringify({
                room, question: '', reply: '本次对话已结束，你的专属AI管家小予我又回来啦。还有什么可以帮到您的吗?',
                time: new Date().toISOString()
            }));
            await redis.expire(endKey, 60 * 60 * 24 * 90);
            return res.status(200).json({ success: true });
        }

        // 房间二维码
        if (action === 'rooms' && req.method === 'GET') {
            const keys = await redis.keys('room:*');
            const rooms = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const room = typeof data === 'string' ? JSON.parse(data) : data;
                    rooms.push({ id: key.replace('room:', ''), name: room.name, token: room.token });
                }
            }
            return res.status(200).json({ rooms });
        }

        // 刷新房间二维码
        if (action === 'refresh_room' && req.method === 'POST') {
            const { id } = req.body || {};
            if (!id) return res.status(400).json({ error: '缺少房间号' });
            const existing = await redis.get(`room:${id}`);
            if (!existing) return res.status(404).json({ error: '房间不存在' });
            const room = typeof existing === 'string' ? JSON.parse(existing) : existing;
            const newToken = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
            room.token = newToken;
            room.updatedAt = new Date().toISOString();
            await redis.set(`room:${id}`, JSON.stringify(room));
            return res.status(200).json({ success: true, token: newToken });
        }

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误' });
    }
}
