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

    // 获取所有接管中的房间列表及未读消息数
    if (req.method === 'GET' && req.query.action === 'rooms') {
        const keys = await redis.keys('takeover:*');
        const rooms = [];
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const takeover = typeof data === 'string' ? JSON.parse(data) : data;
                if (takeover.active) {
                    const room = key.replace('takeover:', '');
                    // 获取未读客人消息数（简单统计 pending_msg 数量）
                    const msgKeys = await redis.keys(`pending_msg:${room}:*`);
                    const unread = msgKeys.length;
                    rooms.push({
                        room,
                        unread,
                        startTime: takeover.startTime,
                        lastGuestMsg: takeover.lastGuestMsg
                    });
                }
            }
        }
        return res.status(200).json({ rooms });
    }

    // 获取某个房间的聊天记录（最近50条，合并 chat: 和 front_msg:）
    if (req.method === 'GET' && req.query.room) {
        const room = req.query.room;
        const chatKeys = await redis.keys(`chat:*`);
        const messages = [];
        for (const key of chatKeys) {
            const data = await redis.get(key);
            if (data) {
                try {
                    const msg = typeof data === 'string' ? JSON.parse(data) : data;
                    if (msg.room === room) {
                        messages.push({
                            sender: 'ai',
                            text: msg.reply || msg.question,
                            time: msg.time
                        });
                    }
                } catch (e) {}
            }
        }
        // 获取前台接管期间的对话（存储在 front_msg:room:*）
        const frontMsgKeys = await redis.keys(`front_msg:${room}:*`);
        for (const key of frontMsgKeys) {
            const data = await redis.get(key);
            if (data) {
                try {
                    const msg = typeof data === 'string' ? JSON.parse(data) : data;
                    messages.push({
                        sender: msg.sender,
                        text: msg.text,
                        time: msg.time
                    });
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
        await redis.set(msgKey, JSON.stringify({
            room,
            sender: 'frontdesk',
            text,
            time: new Date().toISOString()
        }));
        // 清除该房间的未读消息标记（即删除 pending_msg 下的所有消息）
        const pendingKeys = await redis.keys(`pending_msg:${room}:*`);
        for (const key of pendingKeys) {
            await redis.del(key);
        }
        return res.status(200).json({ success: true });
    }

    // 结束接管
    if (req.method === 'POST' && req.body.action === 'end_takeover') {
        const { room } = req.body;
        await redis.del(`takeover:${room}`);
        // 自动发送结束消息（由前台端模拟或AI发送？这里由前台触发后，AI会在下一次接管检测时发送？我们可以在结束接管时，由前台端通过正常AI接口发送一条消息）
        // 或者在此处直接存储一条AI回复作为结束语
        const aiEndMsgKey = `chat:${Date.now()}:end`;
        await redis.set(aiEndMsgKey, JSON.stringify({
            room,
            question: '',
            reply: '本次对话已结束，你的专属AI管家小予我又回来啦。还有什么可以帮到您的吗?',
            time: new Date().toISOString()
        }));
        await redis.expire(aiEndMsgKey, 60 * 60 * 24 * 90);
        return res.status(200).json({ success: true });
    }

    // 获取待处理的通知（房客消息类型）
    if (req.method === 'GET' && req.query.type === 'room_msg') {
        const keys = await redis.keys('notification:*');
        const items = [];
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const notif = typeof data === 'string' ? JSON.parse(data) : data;
                if (notif.type === 'room_msg' && notif.status === 'pending') {
                    items.push({ id: key.replace('notification:', ''), ...notif });
                }
            }
        }
        return res.status(200).json({ notifications: items });
    }

    res.status(404).json({ error: '接口不存在' });
}
