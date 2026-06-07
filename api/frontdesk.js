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

    // 心跳不需密码
    if (action === 'heartbeat') {
        await redis.set('heartbeat:frontdesk', '1', { ex: 60 });
        return res.status(200).json({ success: true });
    }
// 客人端查询前台在线状态（只读，不写入心跳）
if (action === 'online_status') {
    const exists = await redis.exists('heartbeat:frontdesk');
    return res.status(200).json({ online: !!exists });
}
    const password = req.method === 'GET' ? url.searchParams.get('password') : (req.body?.password || '');

    // 客人端查询聊天记录允许 guest 密码
    if (action === 'chat_messages' && req.method === 'GET') {
        if (password !== 'guest' && !(await checkPassword(password))) {
            return res.status(403).json({ error: '密码错误' });
        }
    } else if (action !== 'heartbeat') {
        if (!password || !(await checkPassword(password))) {
            return res.status(403).json({ error: '密码错误' });
        }
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

        // 通知列表
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

        // 接管房间列表（返回 groupId）
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
                        rooms.push({
                            room: r,
                            unread: msgKeys.length,
                            startTime: takeover.startTime,
                            groupId: takeover.groupId || ''
                        });
                    }
                }
            }
            return res.status(200).json({ rooms });
        }

        // 聊天消息（支持 groupId 隔离 + 增量拉取）
        if (action === 'chat_messages' && req.method === 'GET') {
            const room = url.searchParams.get('room');
            const groupId = url.searchParams.get('groupId') || '';
            const since = url.searchParams.get('since');

            if (!room) return res.status(400).json({ error: '缺少房间号' });

            const chatKeys = await redis.keys('chat:*');
            const messages = [];

            for (const key of chatKeys) {
                const data = await redis.get(key);
                if (!data) continue;
                try {
                    const msg = typeof data === 'string' ? JSON.parse(data) : data;
                    if (msg.room !== room) continue;
                    // 隔离规则：如果消息有 groupId，则必须与请求的 groupId 完全匹配
                    if (msg.groupId && msg.groupId !== groupId) continue;
                    if (!msg.groupId && groupId) continue; // 不带 groupId 的消息不返回给有 groupId 的请求

                    const msgTime = new Date(msg.time).getTime();
                    if (since && msgTime <= new Date(since).getTime()) continue;

                    if (msg.question && msg.reply) {
                        messages.push({ sender: 'guest', text: msg.question, time: msg.time });
                        messages.push({ sender: msg.sender || 'ai', text: msg.reply, time: msg.time });
                    } else if (msg.reply) {
                        messages.push({ sender: msg.sender || 'ai', text: msg.reply, time: msg.time });
                    } else if (msg.question) {
                        messages.push({ sender: 'guest', text: msg.question, time: msg.time });
                    }
                } catch (e) {}
            }

            // pending_msg（接管后客人发送的消息）
            const pendingKeys = await redis.keys(`pending_msg:${room}:*`);
            for (const key of pendingKeys) {
                const data = await redis.get(key);
                if (!data) continue;
                try {
                    const msg = typeof data === 'string' ? JSON.parse(data) : data;
                    if (msg.groupId && msg.groupId !== groupId) continue;
                    if (!msg.groupId && groupId) continue;
                    const msgTime = new Date(msg.time).getTime();
                    if (since && msgTime <= new Date(since).getTime()) continue;
                    messages.push({ sender: 'guest', text: msg.text, time: msg.time });
                } catch (e) {}
            }

            messages.sort((a, b) => new Date(a.time) - new Date(b.time));
            return res.status(200).json({ messages });
        }

        // 发送前台消息（带 groupId）
        if (action === 'send_msg' && req.method === 'POST') {
            const { room, text, groupId } = req.body || {};
            if (!room || !text) return res.status(400).json({ error: '缺少参数' });
            const chatKey = `chat:${Date.now()}:${Math.random().toString(36).substr(2,6)}`;
            await redis.set(chatKey, JSON.stringify({
                room,
                groupId: groupId || '',
                question: '',
                reply: text,
                sender: 'frontdesk',
                time: new Date().toISOString()
            }));
            await redis.expire(chatKey, 60 * 60 * 24 * 90);
            // 清除该房间的未读 pending 消息
            const pendingKeys = await redis.keys(`pending_msg:${room}:*`);
            for (const key of pendingKeys) await redis.del(key);
            return res.status(200).json({ success: true });
        }

        // ★ 结束接管（已修复：写入结束消息时携带 groupId）
        if (action === 'end_takeover' && req.method === 'POST') {
            const { room } = req.body || {};
            // 获取接管时的 groupId，确保结束提醒能发送到正确的群组
            const takeoverData = await redis.get(`takeover:${room}`);
            let groupId = '';
            if (takeoverData) {
                const td = typeof takeoverData === 'string' ? JSON.parse(takeoverData) : takeoverData;
                groupId = td.groupId || '';
            }
            await redis.del(`takeover:${room}`);
            const endKey = `chat:${Date.now()}:end`;
            await redis.set(endKey, JSON.stringify({
                room,
                groupId,          // 加上群组标识
                question: '',
                reply: '本次对话已结束，你的专属AI管家小予我又回来啦。还有什么可以帮到您的，您还可以让我为你做很多事比如：定制旅游攻略，查查附近有什么好吃的 等。',
                time: new Date().toISOString()
            }));
            await redis.expire(endKey, 60 * 60 * 24 * 90);
            return res.status(200).json({ success: true });
        }

        // 房间二维码列表（用于临时二维码获取房间信息）
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

        // ===== 临时二维码管理 =====
        // 获取所有临时二维码列表
        if (action === 'temp_qrs' && req.method === 'GET') {
            const keys = await redis.keys('temp_qr:*');
            const qrs = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const qr = typeof data === 'string' ? JSON.parse(data) : data;
                    if (qr.status === 'active') {
                        qrs.push({
                            groupId: key.replace('temp_qr:', ''),
                            roomId: qr.roomId,
                            roomName: qr.roomName,
                            checkin: qr.checkin,
                            checkout: qr.checkout,
                            checkinText: qr.checkinText || '',
                            checkoutText: qr.checkoutText || '',
                            token: qr.token
                        });
                    }
                }
            }
            return res.status(200).json({ qrs });
        }

        // 创建临时二维码
        if (action === 'create_temp_qr' && req.method === 'POST') {
            const { roomId, roomName, token, checkin, checkout } = req.body || {};
            if (!roomId || !checkin || !checkout || !token) return res.status(400).json({ error: '参数不完整' });

            const groupId = `${Date.now()}-${Math.random().toString(36).substr(2,8)}`;

            const formatShowTime = (str) => {
                const y = str.substring(0,4), m = str.substring(4,6), d = str.substring(6,8);
                const h = str.substring(8,10), min = str.substring(10,12);
                return `${y}-${m}-${d} ${h}:${min}`;
            };

            await redis.set(`temp_qr:${groupId}`, JSON.stringify({
                roomId,
                roomName,
                token,
                checkin,
                checkout,
                checkinText: formatShowTime(checkin),
                checkoutText: formatShowTime(checkout),
                status: 'active',
                createdAt: Date.now()
            }));

            return res.status(200).json({ success: true, groupId });
        }

        // 删除（停用）临时二维码
        if (action === 'delete_temp_qr' && req.method === 'POST') {
            const { groupId } = req.body || {};
            if (!groupId) return res.status(400).json({ error: '缺少 groupId' });
            const existing = await redis.get(`temp_qr:${groupId}`);
            if (!existing) return res.status(404).json({ error: '二维码不存在' });
            const qr = typeof existing === 'string' ? JSON.parse(existing) : existing;
            qr.status = 'disabled';
            await redis.set(`temp_qr:${groupId}`, JSON.stringify(qr));
            return res.status(200).json({ success: true });
        }

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误' });
    }
}
