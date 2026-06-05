import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const hotelInfo = `
【民宿基本信息】
- 民宿名称：霞浦县山予海民宿
- 地址：福建省宁德市霞浦县三沙镇奇沙17号
- 联系电话：0593-8850999（前台上班时间：上午8:00-晚23:00）
- 退房时间：中午12:00前
- 入住时间：下午14:00后
- WiFi名称：山予海
- WiFi密码：88888888
- 早餐时间：7:30-9:00，负一楼海景餐厅
- 早餐内容：中式早餐或当地的特色早餐每天不同不固定供应（中式早餐有：稀饭，牛奶，包子，油条，鸡蛋等小菜。特色早餐有：锅边糊，米粉糊，酸辣汤等。早餐信息不要扩充按照填写的信息来）
- 停车：免费停车位，可停9辆车
- 行李寄存：免费
- 加床：不可加床
- 热水：民宿提供24小时热水
- 充电桩：民宿门口有充电桩可以自行扫码使用

【民宿特色】
- 所有房间都是180度海景房，躺在床上就能看大海
- 顶楼露台和一楼吧台是网红打卡点，拍照绝美
- 民宿闹中取静，在东线中间位置，去周边景点都很方便
- 老板是一个年轻的小伙，热情好客，会提供赶海工具和旅游攻略
- 如果客人没开车，老板可以帮忙联系包车师傅，价格比平台便宜
- 民宿门口有一排共享电动车，扫码就能骑走

【周边距离和交通时间】
- 三沙镇吃饭一条街：1公里，开车约3分钟，步行约13分钟
- 东壁村日落观景台：1.3公里，开车约3分钟，步行约15分钟
- 最近的沙滩：开车约6分钟
- 花竹一号日出打卡点：开车约15分钟
- 小皓赶海沙滩：开车约15分钟
- 霞浦县城：开车约30分钟
- 高罗沙滩、大京沙滩：开车约1小时
- 下尾岛：开车约1个半小时
- 霞浦动车站：开车约35分钟

【旅游攻略推荐】
两天一夜经典游：
Day1：下午14:00入住 → 傍晚东壁村看日落（车程3分钟）→ 晚上三沙镇吃海鲜
Day2：早上（按照日出距离时间来安排日出时间）花竹1号观景平台看日出（车程15分钟建议客人按照日出时间前半个小时出发）→ 7:30早餐 → （按照具体三沙镇的赶海潮汐来推荐赶海时间）小皓沙滩赶海 → 中午退房

三天两夜深度游：
Day1：下午入住 → 傍晚东壁日落 → 晚上三沙镇海鲜
Day2：早上花竹日出 → 早餐 → 小皓赶海 → 下午高罗沙滩 → 晚上露台吹海风
Day3：早餐 → 下尾岛 → 县城逛逛 → 返程

【特殊服务】
- 提供赶海工具免费使用
- 帮忙查潮汐时间
- 帮忙联系包车师傅
- 可代订海鲜大排档
- 前台可借充电宝、雨伞
`;

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

        let systemPrompt = `你是"${aiSettings.name}"，山予海民宿的专属AI管家，性格亲切活泼，像朋友一样和客人交流。

【核心规则】
1. 你只能回答与山予海民宿及相关旅游的问题。遇到完全无关的问题，请礼貌拒绝。
2. 理解客人的同义表达。
3. 如果客人问题模糊，主动追问。
4. 用第一人称，亲切自然，适当使用emoji。
5. 如果遇到需要人工处理的问题，提示拨打前台电话 0593-8850999。
6.客人问的日出时间日落时间以及赶海最佳时间，必须按照实际时间为准。
【民宿完整信息】
${hotelInfo}

【补充知识库】
${knowledgeText || '暂无'}`;

        // 检查关键词（用于后续通知和回复）
        const matched = await matchKeywords(question);

        // 如果关键词有预设回复内容，将回复指令加入系统提示，让AI基于此扩展回复
        if (matched && matched.reply) {
            systemPrompt += `\n\n【特别注意】客人提到了“${matched.keyword}”，请根据以下指令生成回复：${matched.reply}。请以亲切、自然的语气扩展成完整的回复，适当加入emoji。`;
        }

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
                temperature: 0.7,
                max_tokens: 800
            })
        });

        const data = await response.json();
        if (data.error) return res.status(500).json({ error: 'AI异常' });
        const content = data?.choices?.[0]?.message?.content;
        if (!content) return res.status(500).json({ error: 'AI无返回' });
        let reply = content;

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

        // 创建通知（排除类型为 "other" 的关键词）
        if (matched && matched.type !== 'other') {
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
