import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 你的民宿信息保持不变
const hotelInfo = `...`;  // 你原来的 hotelInfo，不用动

async function getAISettings() {
    const settings = await redis.get('config:ai');
    if (!settings) {
        return {
            name: '小予',
            fallbackReply: '抱歉，{name}暂时无法回答这个问题～请拨打前台电话 {phone} 咨询哦',
            fallbackNote: ''
        };
    }
    const data = typeof settings === 'string' ? JSON.parse(settings) : settings;
    return {
        name: data.name || '小予',
        fallbackReply: data.fallbackReply || '',
        fallbackNote: data.fallbackNote || ''
    };
}

async function matchKeywords(text) {
    const keywordsData = await redis.get('config:keywords');
    if (!keywordsData) return null;
    const list = typeof keywordsData === 'string' ? JSON.parse(keywordsData) : keywordsData;
    if (!Array.isArray(list)) return null;
    let fallback = null;
    for (const item of list) {
        if (text.includes(item.keyword)) {
            if (item.type !== 'other') return item;
            else fallback = item;
        }
    }
    return fallback;
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

        const now = new Date();
        const todayStr = now.toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
        const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

        let systemPrompt = `你是"${aiSettings.name}"，山予海民宿的专属AI管家，性格亲切活泼，像朋友一样和客人交流。
现在是${todayStr} ${timeStr}。请回答客人关于日期、时间、潮汐等问题时参考这个时间。

【核心规则】
1. 你只能回答与山予海民宿及相关旅游的问题。遇到完全无关的问题，请礼貌拒绝。
2. 理解客人的同义表达。
3. 如果客人问题模糊，主动追问。
4. 用第一人称，亲切自然，适当使用emoji。
5. 如果遇到需要人工处理的问题，提示拨打前台电话 138xxxx1234。

【民宿完整信息】
${hotelInfo}

【补充知识库】
${knowledgeText || '暂无'}`;

        const matched = await matchKeywords(question);

        if (matched && matched.reply) {
            let replyBody = matched.reply;
            let instruction = '';
            const bracketMatch = matched.reply.match(/（([^）]+)）/);
            if (bracketMatch) {
                replyBody = matched.reply.replace(/（[^）]+）/, '').trim();
                instruction = bracketMatch[1];
            }
            if (replyBody) systemPrompt += `\n\n【回复要点】请根据以下内容生成回复：${replyBody}`;
            if (instruction) systemPrompt += `\n【回复指示】请严格遵循以下要求来调整回复的语气、风格或内容：${instruction}`;
        }

        // ★★★ 火山方舟 API 请求 ★★★
        const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.VOLCENGINE_API_KEY}`  // 环境变量名改成你的
            },
            body: JSON.stringify({
                model: 'deepseek-v3-250324',  // 火山方舟的模型名称
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                temperature: 0.7,
                max_tokens: 800
            })
        });

        const data = await response.json();
        if (data.error) return res.status(500).json({ error: 'AI异常：' + data.error.message });
        const content = data?.choices?.[0]?.message?.content;
        if (!content) return res.status(500).json({ error: 'AI无返回' });
        let reply = content;

        // 记录未回答问题
        if (reply.includes('不太确定') || reply.includes('无法回答') || reply.includes('这个我不太清楚')) {
            await redis.set(`unanswered:${Date.now()}`, JSON.stringify({
                question, room: room || '', time: new Date().toISOString(), status: 'pending'
            }));
            reply = aiSettings.fallbackReply.replace('{name}', aiSettings.name).replace('{phone}', '138xxxx1234').replace('{room}', room || '');
            if (aiSettings.fallbackNote) reply += '\n' + aiSettings.fallbackNote;
        }

        const chatKey = `chat:${Date.now()}:${Math.random().toString(36).substr(2,6)}`;
        await redis.set(chatKey, JSON.stringify({ room: room || '未知', question, reply, time: new Date().toISOString() }));
        await redis.expire(chatKey, 60 * 60 * 24 * 90);

        if (matched && matched.type !== 'other') {
            await redis.set(`notification:${Date.now()}`, JSON.stringify({
                room: room || '未知', question, reply, keyword: matched.keyword, type: matched.type,
                time: new Date().toISOString(), status: 'pending'
            }));
        }

        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: '服务错误' });
    }
}
