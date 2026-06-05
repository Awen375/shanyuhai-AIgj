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

        // ★ 刷新房间 token，确保旧 token 失效
        if (action === 'rooms/refresh' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少房间号' });
            const existing = await redis.get(`room:${id}`);
            if (!existing) return res.status(404).json({ error: '房间不存在' });
            
            const room = typeof existing === 'string' ? JSON.parse(existing) : existing;
            // 生成全新 token，立即覆盖旧值
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

        // ===== 聊天记录 =====
        if (action === 'chatlogs' && req.method === 'GET') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('chat:*');
            const logs = [];
            for (const key of keys) {
                const data = await redis.get(key);
                if (data) {
                    try {
                        const log = typeof data === 'string' ? JSON.parse(data) : data;
                        logs.push({ id: key.replace('chat:', ''), ...log });
                    } catch (e) {}
                }
            }
            logs.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ logs: logs.slice(0, 200) });
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
            for (const key of keys) {
                await redis.del(key);
            }
            return res.status(200).json({ success: true, deleted: keys.length });
        }

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误' });
    }
}
