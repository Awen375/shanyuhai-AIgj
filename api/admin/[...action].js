import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_PASSWORD = 'zjm1314520';

export default async function handler(req, res) {
    try {
        const pathOnly = req.url.split('?')[0];
        const rawAction = pathOnly.replace('/api/admin/', '').replace('/api/admin', '');
        const action = rawAction || '';

        const adminToken = req.headers['x-admin-token'];
        const checkAdmin = () => {
            if (adminToken !== ADMIN_PASSWORD) {
                res.status(403).json({ error: '禁止访问' });
                return false;
            }
            return true;
        };

        // ===== 房间管理 =====
        if (action === 'rooms' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('room:*');
            const rooms = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const room = typeof data === 'string' ? JSON.parse(data) : data;
                    rooms.push({ id: key.replace('room:', ''), ...room });
                }
            }
            rooms.sort((a, b) => {
                const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
                return numA - numB;
            });
            return res.status(200).json({ rooms });
        }

        if (action === 'rooms' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { id, name } = req.body;
            if (!id) return res.status(400).json({ error: '缺少房间号' });
            const existing = await redis.get(`room:${id}`);
            if (existing) {
                const room = typeof existing === 'string' ? JSON.parse(existing) : existing;
                room.name = name || room.name;
                await redis.set(`room:${id}`, JSON.stringify(room));
                return res.status(200).json({ success: true, updated: true });
            }
            const token = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
            await redis.set(`room:${id}`, JSON.stringify({
                name: name || `${id}号房`,
                token,
                createdAt: new Date().toISOString(),
                status: 'active'
            }));
            return res.status(200).json({ success: true, token });
        }

        if (action === 'rooms' && req.method === 'DELETE') {
            if (!checkAdmin()) return;
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少房间号' });
            await redis.del(`room:${id}`);
            return res.status(200).json({ success: true });
        }

        if (action === 'rooms/refresh' && req.method === 'POST') {
            if (!checkAdmin()) return;
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

        // ===== AI管家设置 =====
        if (action === 'ai-settings') {
            if (!checkAdmin()) return;
            if (req.method === 'GET') {
                const settings = await redis.get('config:ai') || {
                    name: '小予',
                    fallbackReply: '抱歉，{name}暂时无法回答这个问题～请拨打前台电话 {phone} 咨询哦',
                    fallbackNote: ''
                };
                const data = typeof settings === 'string' ? JSON.parse(settings) : settings;
                return res.status(200).json(data);
            }
            if (req.method === 'POST') {
                const { name, fallbackReply, fallbackNote } = req.body;
                await redis.set('config:ai', JSON.stringify({
                    name: name || '小予',
                    fallbackReply: fallbackReply || '',
                    fallbackNote: fallbackNote || ''
                }));
                return res.status(200).json({ success: true });
            }
        }

        // ===== 未解决问题 =====
        if (action === 'unanswered' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('unanswered:*');
            const items = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const item = typeof data === 'string' ? JSON.parse(data) : data;
                    if (item.status !== 'resolved') {
                        items.push({ id: key.replace('unanswered:', ''), ...item });
                    }
                }
            }
            items.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ items });
        }

        if (action === 'unanswered' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { taskId, answer } = req.body;
            if (!taskId || !answer) return res.status(400).json({ error: '缺少参数' });
            const taskData = await redis.get(`unanswered:${taskId}`);
            if (!taskData) return res.status(404).json({ error: '任务不存在' });
            const task = typeof taskData === 'string' ? JSON.parse(taskData) : taskData;
            task.status = 'resolved';
            task.answer = answer;
            task.resolvedAt = new Date().toISOString();
            await redis.set(`unanswered:${taskId}`, JSON.stringify(task));

            const existingKeys = await redis.keys('knowledge:*');
            let exists = false;
            for (const key of existingKeys) {
                const data = await redis.get(key);
                if (data) {
                    const k = typeof data === 'string' ? JSON.parse(data) : data;
                    if (k.question === task.question) { exists = true; break; }
                }
            }
            if (!exists) {
                await redis.set(`knowledge:${Date.now()}`, JSON.stringify({
                    question: task.question,
                    answer: answer
                }));
            }
            return res.status(200).json({ success: true });
        }

        // ===== 已解决问题 =====
        if (action === 'resolved' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('unanswered:*');
            const items = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const item = typeof data === 'string' ? JSON.parse(data) : data;
                    if (item.status === 'resolved') {
                        items.push({ id: key.replace('unanswered:', ''), ...item });
                    }
                }
            }
            items.sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
            return res.status(200).json({ items });
        }

        // ===== 聊天记录汇总 =====
        if (action === 'chat-summary' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('chat:*');
            const roomsMap = {};
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const log = typeof data === 'string' ? JSON.parse(data) : data;
                        const room = log.room || '未知';
                        if (!roomsMap[room]) roomsMap[room] = { lastTime: log.time, count: 0 };
                        else if (log.time > roomsMap[room].lastTime) roomsMap[room].lastTime = log.time;
                        roomsMap[room].count++;
                    } catch (e) {}
                }
            }
            const summary = Object.entries(roomsMap).map(([room, info]) => ({ room, lastTime: info.lastTime, total: info.count }));
            summary.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
            return res.status(200).json({ summary });
        }

        if (action === 'chatlogs' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const { room, date } = req.query;
            const keys = await redis.keys('chat:*');
            const logs = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const log = typeof data === 'string' ? JSON.parse(data) : data;
                        if (room && log.room !== room) continue;
                        if (date && new Date(log.time).toISOString().slice(0, 10) !== date) continue;
                        logs.push({ id: key.replace('chat:', ''), ...log });
                    } catch (e) {}
                }
            }
            logs.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ logs });
        }

        if (action === 'chatlogs' && req.method === 'DELETE') {
            if (!checkAdmin()) return;
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少记录ID' });
            await redis.del(`chat:${id}`);
            return res.status(200).json({ success: true });
        }

        if (action === 'chatlogs/clear' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('chat:*');
            for (const key of keys) await redis.del(key);
            return res.status(200).json({ success: true, deleted: keys.length });
        }

        // ===== 中控台 - 关键词 =====
        if (action === 'alert-keywords' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const data = await redis.get('config:alert_keywords');
            const keywords = data ? (typeof data === 'string' ? JSON.parse(data) : data) : [];
            return res.status(200).json({ keywords });
        }

        if (action === 'alert-keywords' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { keywords } = req.body;
            if (!Array.isArray(keywords)) return res.status(400).json({ error: 'keywords 必须是数组' });
            await redis.set('config:alert_keywords', JSON.stringify(keywords));
            return res.status(200).json({ success: true });
        }

        // ===== 通知列表 =====
        if (action === 'notifications' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('notification:*');
            const items = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const notif = typeof data === 'string' ? JSON.parse(data) : data;
                    if (notif.status === 'pending') items.push({ id: key.replace('notification:', ''), ...notif });
                }
            }
            items.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ notifications: items });
        }

        if (action === 'notifications' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少通知ID' });
            const notifData = await redis.get(`notification:${id}`);
            if (!notifData) return res.status(404).json({ error: '通知不存在' });
            const notif = typeof notifData === 'string' ? JSON.parse(notifData) : notifData;
            notif.status = 'done';
            notif.resolvedAt = new Date().toISOString();
            await redis.set(`notification:${id}`, JSON.stringify(notif));
            return res.status(200).json({ success: true });
        }

        if (action === 'notifications-history' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('notification:*');
            const items = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    const notif = typeof data === 'string' ? JSON.parse(data) : data;
                    if (notif.status === 'done') items.push({ id: key.replace('notification:', ''), ...notif });
                }
            }
            items.sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));
            return res.status(200).json({ history: items });
        }

        // ===== 前台端设置 =====
        if (action === 'frontdesk-password' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const pwd = await redis.get('config:frontdesk_password') || '1234';
            return res.status(200).json({ password: pwd });
        }

        if (action === 'frontdesk-password' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { password } = req.body;
            if (!password) return res.status(400).json({ error: '缺少密码' });
            await redis.set('config:frontdesk_password', password);
            return res.status(200).json({ success: true });
        }

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误' });
    }
}
