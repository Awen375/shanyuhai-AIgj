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

【重要提醒】
关于潮汐和赶海时间的建议为估算值，存在不确定性。如需获取最准确的潮汐信息，建议咨询前台的小伙伴。需要我帮您呼叫前台吗？如需呼叫，请回复“呼叫前台”。
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
    
    // 优先匹配 room_msg 类型，确保人工客服触发正确
    let matchedOther = null;
    for (const item of list) {
        if (text.includes(item.keyword)) {
            if (item.type === 'room_msg') return item;
            if (item.type === 'other') {
                matchedOther = item;
                continue;
            }
            return item;
        }
    }
    return matchedOther;
}

async function isFrontdeskOnline() {
    const heartbeat = await redis.get('heartbeat:frontdesk');
    return !!heartbeat;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
    const { question, room } = req.body || {};
    if (!question) return res.status(400).json({ error: '请输入问题' });

    try {
        const aiSettings = await getAISettings();

        const takeoverData = await redis.get(`takeover:${room}`);
        const isTakeover = takeoverData && (typeof takeoverData === 'object' ? takeoverData.active : JSON.parse(takeoverData).active);

        if (isTakeover) {
            await redis.set(`pending_msg:${room}:${Date.now()}`, JSON.stringify({
                room, sender: 'guest', text: question, time: new Date().toISOString()
            }));
            return res.status(200).json({ reply: '' });
        }

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
        const beijingTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        const todayStr = beijingTime.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const timeStr = beijingTime.toLocaleTimeString('zh-CN', { hour12: false });
        const hour = beijingTime.getHours();

        const matched = await matchKeywords(question);
        console.log('关键词匹配结果:', JSON.stringify(matched));

        if (matched && matched.type === 'room_msg') {
            const online = await isFrontdeskOnline();
            console.log('前台在线状态:', online);
            if (hour >= 23 || hour < 8) {
                if (online) {
                    await redis.set(`notification:${Date.now()}`, JSON.stringify({
                        room: room || '未知', question, reply: '', keyword: matched.keyword,
                        type: 'room_msg', time: new Date().toISOString(), status: 'pending'
                    }));
                    await redis.set(`takeover:${room}`, JSON.stringify({
                        active: true, startTime: Date.now(), lastGuestMsg: Date.now()
                    }));
                    console.log(`接管房间已设置: takeover:${room}`);
                    return res.status(200).json({ reply: '正在通知前台的小伙伴，接通中请稍等...' });
                } else {
                    return res.status(200).json({ reply: '我们前台的小伙伴们都下班啦！目前是下班时间，有什么问题您可以先问我我可以帮您处理的。上班时间：8:00-23:00' });
                }
            } else {
                if (online) {
                    await redis.set(`notification:${Date.now()}`, JSON.stringify({
                        room: room || '未知', question, reply: '', keyword: matched.keyword,
                        type: 'room_msg', time: new Date().toISOString(), status: 'pending'
                    }));
                    await redis.set(`takeover:${room}`, JSON.stringify({
                        active: true, startTime: Date.now(), lastGuestMsg: Date.now()
                    }));
                    console.log(`接管房间已设置: takeover:${room}`);
                    return res.status(200).json({ reply: '正在通知前台的小伙伴，接通中请稍等...' });
                } else {
                    return res.status(200).json({ reply: '目前前台小伙伴不在线，您可以先留言，我们稍后回复您。' });
                }
            }
        }

        // 其余逻辑保持不变，这里为了节省篇幅省略了systemPrompt构建和AI调用部分，你现有的就可以
        // ... 请把你原来文件里剩下的构建提示词、调AI、存储日志的代码完整保留 ...
        
        return res.status(200).json({ reply });
    } catch (err) {
        return res.status(500).json({ error: '服务错误' });
    }
}
