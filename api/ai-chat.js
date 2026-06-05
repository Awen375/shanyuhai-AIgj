import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const hotelInfo = `...`; // 保持原有民宿信息不变

async function getAISettings() {
    const settings = await redis.get('config:ai');
    if (!settings) {
        return { name: '小予', fallbackReply: '抱歉，{name}暂时无法回答这个问题～请拨打前台电话 {phone} 咨询哦', fallbackNote: '' };
    }
    const data = typeof settings === 'string' ? JSON.parse(settings) : settings;
    return { name: data.name || '小予', fallbackReply: data.fallbackReply || '', fallbackNote: data.fallbackNote || '' };
}

async function matchKeywords(text) {
    const keywordsData = await redis.get('config:keywords');
    if (!keywordsData) return null;
    const list = typeof keywordsData === 'string' ? JSON.parse(keywordsData) : keywordsData;
    if (!Array.isArray(list)) return null;
    for (const item of list) {
        if (text.includes(item.keyword)) {
            return item;
        }
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
    const { question, room } = req.body || {};
    if (!question) return res.status(400).json({ error: '请输入问题' });

    try {
        const aiSettings = await getAISettings();
        const knowledgeKeys = await redis.keys('knowledge:*');
        let knowledgeText = '';
        for (const key of knowledgeKeys) {
            const item = await redis.get(key);
            if (item) {
                const k = typeof item === 'string' ? JSON.parse(item) : item;
                knowledgeText += `问：${k.question}\n答：${k.answer}\n\n`;
            }
        }

        let systemPrompt = `你是"${aiSettings.name}"，山予海民宿的专属AI管家...` + hotelInfo;

        // 检查是否有关键词触发，如果有且设置了回复指令，则将指令加入系统提示，让AI基于此生成回复
        const matched = await matchKeywords(question);
        if (matched && matched.reply) {
            systemPrompt += `\n\n【特别注意】客人提到了“${matched.keyword}”，请根据以下指令生成回复：${matched.reply}。请以亲切、自然的语气扩展成完整的回复，适当加入emoji。`;
        }

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
                temperature: 0.7, max_tokens: 800
            })
        });
        const data = await response.json();
        if (data.error) return res.status(500).json({ error: 'AI异常' });
        const content = data?.choices?.[0]?.message?.content;
        if (!content) return res.status(500).json({ error: 'AI无返回' });
        let reply = content;

        // 如果因为AI未按要求生成，或者为了确保关键词被覆盖，可以再判断一次，但通常AI会遵循指令

        // 记录未回答
        if (reply.includes('不太确定') || reply.includes('无法回答') || reply.includes('这个我不太清楚')) {
            await redis.set(`unanswered:${Date.now()}`, JSON.stringify({
                question, room: room || '', time: new Date().toISOString(), status: 'pending'
            }));
            reply = aiSettings.fallbackReply.replace('{name}', aiSettings.name).replace('{phone}', '138xxxx1234').replace('{room}', room || '');
            if (aiSettings.fallbackNote) reply += '\n' + aiSettings.fallbackNote;
        }

        // 存储聊天记录
        const chatKey = `chat:${Date.now()}:${Math.random().toString(36).substr(2,6)}`;
        await redis.set(chatKey, JSON.stringify({ room: room || '未知', question, reply, time: new Date().toISOString() }));
        await redis.expire(chatKey, 60*60*24*90);

        // 创建通知（无论是否有预设回复）
        if (matched) {
            await redis.set(`notification:${Date.now()}`, JSON.stringify({
                room: room || '未知',
                question,
                reply,
                keyword: matched.keyword,
                type: matched.type,
                time: new Date().toISOString(),
                status: 'pending'
            }));
        }

        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: '服务错误' });
    }
}
