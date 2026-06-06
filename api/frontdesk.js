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
    if (!(await checkPassword(password))) return res.status(403).json({ error: '密码错误' });

    // ===== 主数据接口：今日使用房间 + 未处理通知 =====
    if (req.method === 'GET' && !req.query.action && !req.query.type && !req.query.history) {
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

    // ===== 通知列表（按类型） =====
    if (req.method === 'GET' && req.query.type && !req.query.history) {
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

    // 标记通知为已处理
    if (req.method === 'POST' && req.query.type) {
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

    // ===== 通知历史（按类型） =====
    if (req.method === 'GET' && req.query.history === '1') {
        const type = req.query.type;
        const keys = await redis.keys('notification:*');
        const history = [];
        for (const key of keys) {
            const raw = await redis.get(key);
            if (raw) {
                const n = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (n.status === 'done') {
                    if (!type || n.type === type) {
                        history.push({ id: key.replace('notification:', ''), room: n.room, question: n.question, resolvedAt: n.resolvedAt, type: n.type });
                    }
                }
            }
        }
        history.sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
        return res.status(200).json({ history });
    }

    // ===== 接管房间相关 =====
    if (req.method === 'GET' && req.query.action === 'rooms') {
        const keys = await redis.keys('takeover:*');
        const rooms = [];
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const takeover = typeof data === 'string' ? JSON.parse(data) : data;
                if (takeover.active) {
                    const room = key.replace('takeover:', '');
                    const msgKeys = await redis.keys(`pending_msg:${room}:*`);
                    const unread = msgKeys.length;
                    rooms.push({ room, unread, startTime: takeover.startTime, lastGuestMsg: takeover.lastGuestMsg });
                }
            }
        }
        return res.status(200).json({ rooms });
    }

    // 获取某个房间的聊天记录
    if (req.method === 'GET' && req.query.room && !req.query.action) {
        const room = req.query.room;
        const chatKeys = await redis.keys(`chat:*`);
        const messages = [];
        for (const key of chatKeys) {
            const data = await redis.get(key);
            if (data) {
                try {
                    const msg = typeof data === 'string' ? JSON.parse(data) : data;
                    if (msg.room === room && msg.reply) {
                        messages.push({ sender: 'ai', text: msg.reply, time: msg.time });
                    }
                } catch (e) {}
            }
        }
        const frontMsgKeys = await redis.keys(`front_msg:${room}:*`);
        for (const key of frontMsgKeys) {
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

    // 前台发送消息
    if (req.method === 'POST' && req.body.room && req.body.text) {
        const { room, text } = req.body;
        const msgKey = `front_msg:${room}:${Date.now()}`;
        await redis.set(msgKey, JSON.stringify({ room, sender: 'frontdesk', text, time: new Date().toISOString() }));
        const pendingKeys = await redis.keys(`pending_msg:${room}:*`);
        for (const key of pendingKeys) await redis.del(key);
        return res.status(200).json({ success: true });
    }

    // 结束接管
    if (req.method === 'POST' && req.body.action === 'end_takeover') {
        const { room } = req.body;
        await redis.del(`takeover:${room}`);
        const endKey = `chat:${Date.now()}:end`;
        await redis.set(endKey, JSON.stringify({
            room, question: '', reply: '本次对话已结束，你的专属AI管家小予我又回来啦。还有什么可以帮到您的吗?',
            time: new Date().toISOString()
        }));
        await redis.expire(endKey, 60 * 60 * 24 * 90);
        return res.status(200).json({ success: true });
    }

    // ===== 房间二维码相关（前台专用） =====
    if (req.method === 'GET' && req.query.action === 'rooms_qr') {
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

    if (req.method === 'POST' && req.query.action === 'refresh_room') {
        const { id } = req.body;
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

    res.status(404).json({ error: '接口不存在' });
}
