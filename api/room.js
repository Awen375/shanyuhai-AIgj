import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
    const { room, token } = req.query;
    
    if (!room || !token) {
        return res.status(400).json({ valid: false, error: '缺少参数' });
    }

    try {
        const roomData = await redis.get(`room:${room}`);
        if (!roomData) {
            return res.status(200).json({ valid: false, reason: 'room_not_found' });
        }

        const roomInfo = typeof roomData === 'string' ? JSON.parse(roomData) : roomData;
        
        // ★ 严格比对 token，不一致则返回过期
        if (roomInfo.token !== token) {
            return res.status(200).json({ valid: false, reason: 'token_expired' });
        }

        return res.status(200).json({ 
            valid: true, 
            name: roomInfo.name || `${room}号房`,
            room 
        });
    } catch (err) {
        return res.status(500).json({ valid: false, error: '服务器错误' });
    }
}
