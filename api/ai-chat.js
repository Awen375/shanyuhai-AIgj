import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const hotelInfo = `
【民宿定位与导航】
- 高德导航：https://uri.amap.com/marker?position=120.207718,26.920075&name=山予海民宿
- 百度导航：https://api.map.baidu.com/marker?location=120.214190,26.926040&title=山予海民宿&content=霞浦县三沙镇奇沙17号&output=html
（请将上面百度链接的坐标替换为你从百度地图实际获取的坐标）

【周边景点定位与导航】
- 三沙镇吃饭一条街：
  高德 https://uri.amap.com/marker?position=120.2183166584168,26.920891508999237&name=三沙镇美食街
  百度 https://api.map.baidu.com/marker?location=120.224837,26.927057&title=三沙镇美食街&output=html
- 东壁村日落观景台：
  高德 https://uri.amap.com/marker?position=120.19182005293995,26.919324893525214&name=东壁村日落观景台
  百度 https://api.map.baidu.com/marker?location=120.198407,26.925055&title=东壁村日落观景台&output=html
- 花竹一号日出打卡点：
  高德 https://uri.amap.com/marker?position=120.23444411892245,26.941406283787998&name=花竹日出观景台
  百度 https://api.map.baidu.com/marker?location=120.240865,26.947751&title=花竹日出观景台&output=html
- 小皓赶海沙滩：
  高德 https://uri.amap.com/marker?position=120.14894053534572,26.92743848598469&name=小皓赶海沙滩
  百度 https://api.map.baidu.com/marker?location=120.157815,26.935029&title=小皓赶海沙滩&output=html
- 高罗沙滩：
  高德 https://uri.amap.com/marker?position=120.09907717270104,26.75110481058203&name=高罗沙滩
  百度 https://api.map.baidu.com/marker?location=120.105532,26.757267&title=高罗沙滩&output=html
- 大京沙滩：
  高德 https://uri.amap.com/marker?position=120.10950696017353,26.69654763131801&name=大京沙滩
  百度 https://api.map.baidu.com/marker?location=120.115942,26.702855&title=大京沙滩&output=html
- 下尾岛：
  高德 https://uri.amap.com/marker?position=120.12220101700336,26.657081457374364&name=下尾岛
  百度 https://api.map.baidu.com/marker?location=120.128637,26.663443&title=下尾岛&output=html
- 霞浦县城：
  高德 https://uri.amap.com/marker?position=120.02633366127935,26.882658443201795&name=霞浦县城
  百度 https://api.map.baidu.com/marker?location=120.032826,26.888742&title=霞浦县城&output=html
- 霞浦动车站：
  高德 https://uri.amap.com/marker?position=120.03254765443904,26.90892009243058&name=霞浦动车站
  百度 https://api.map.baidu.com/marker?location=120.039078,26.914876&title=霞浦动车站&output=html
- 观影栈道：
  高德 https://uri.amap.com/marker?position=120.17350830038365,26.925858448281875&name=观影栈道
  百度 https://api.map.baidu.com/marker?location=120.180098,26.931521&title=观影栈道&output=html
- 太姥山：
  高德 https://uri.amap.com/marker?position=120.24214782042311,27.099462178738797&name=太姥山
  百度 https://api.map.baidu.com/marker?location=120.248697,27.105761&title=太姥山&output=html
- 杨家溪：
  高德 https://uri.amap.com/marker?position=120.12477387581832,27.02425633154216&name=杨家溪
  百度 https://api.map.baidu.com/marker?location=120.131214,27.030610&title=杨家溪&output=html
- 虞公亭沙滩日落：
  高德 https://uri.amap.com/marker?position=120.1852065074927,26.923888448736097&name=虞公亭沙滩日落
  百度 https://api.map.baidu.com/marker?location=120.191799,26.929545&title=虞公亭沙滩日落&output=html
- 闾峡灯塔：
  高德 https://uri.amap.com/marker?position=120.13596952285687,26.644914578867578&name=闾峡灯塔
  百度 https://api.map.baidu.com/marker?location=120.142421,26.651158&title=闾峡灯塔&output=html
- 丹湾观景台：
  高德 https://uri.amap.com/marker?position=120.10977234113243,26.68525567486343&name=丹湾观景台
  百度 https://api.map.baidu.com/marker?location=120.116217,26.691568&title=丹湾观景台&output=html
- 嵛山岛登船码头：
  高德 https://uri.amap.com/marker?position=120.24475829561719,26.935613143519664&name=嵛山岛登船码头
  百度 https://api.map.baidu.com/marker?location=120.251184,26.941964&title=嵛山岛登船码头&output=html

【民宿基本信息】
- 民宿名称：霞浦县山予海民宿
- 地址：福建省宁德市霞浦县三沙镇奇沙17号
- 联系电话：0593-8850999（前台上班时间：上午8:00-晚23:00）
- 退房时间：中午12:00前
- 入住时间：下午14:00后
- WiFi名称：山予海
- WiFi密码：88888888
- 早餐时间：7:30-9:00，负一楼海景餐厅
- 早餐内容：中式早餐跟当地的特色早餐每天随机提供一种早餐（“中式早餐有：稀饭，牛奶，包子，油条，鸡蛋等小菜” 或 “特色早餐有：锅边糊，米粉糊，酸辣汤等”。早餐信息不要扩充按照填写的信息来，并且要告知客人,每天提供的早餐不同可能是中式早餐也有可能是特色早餐，询问客人是否要联系前台咨询早餐信息如需咨询早餐信息就回复“呼叫前台”）
- 停车：免费停车位，可停9辆车
- 行李寄存：免费
- 加床：不可加床
- 热水：民宿提供24小时热水
- 充电桩：民宿门口有充电桩可以自行扫码使用
- 大门密码：民宿一楼的大门密码是：1357 按完密码后直接推一下大门就能打开不需要按#号键

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
- 观影栈道：2.6公里，开车约7分钟
- 虞公亭沙滩日落：开车约6分钟
- 花竹一号日出打卡点：开车约15分钟
- 小皓赶海沙滩：开车约16分钟
- 霞浦县城：开车约30分钟
- 高罗沙滩、大京沙滩：开车约1小时
- 下尾岛：开车约1个半小时
- 霞浦动车站：开车约35分钟
- 杨家溪：开车约47分钟
- 太姥山：开车约43分钟
- 闾峡灯塔：开车约1小时39分
- 丹湾观景台：开车约1小时16分
- 嵛山岛登船码头：开车约12分，如果提到有关于嵛山岛的登船事宜时建议客人提前打开第三方购票软件提前查看班次以及返程的时间等

【霞浦热门景点清单（供行程推荐参考）】
- 东壁村日落观景台：1.3公里，开车约3分钟，步行约15分钟
- 观影栈道：2.6公里，开车约7分钟
- 虞公亭沙滩日落：开车约6分钟
- 花竹一号日出打卡点：开车约15分钟
- 小皓赶海沙滩：开车约16分钟
- 三沙镇美食街：1公里，开车约3分钟，步行约13分钟
- 高罗沙滩：开车约1小时
- 大京沙滩：开车约1小时
- 下尾岛：开车约1个半小时
- 丹湾观景台：开车约1小时16分
- 闾峡灯塔：开车约1小时39分
- 杨家溪：开车约47分钟
- 太姥山：开车约43分钟
- 嵛山岛登船码头：开车约12分（需提前查船班）
- 霞浦县城：开车约30分钟
- 霞浦动车站：开车约35分钟

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
    
    let matchedOther = null;
    let matchedRoomMsg = null;
    let matchedNormal = null;
    
    for (const item of list) {
        if (text.includes(item.keyword)) {
            if (item.type === 'room_msg') {
                matchedRoomMsg = item;
                break;
            }
            if (item.type === 'other') {
                matchedOther = item;
                continue;
            }
            if (!matchedNormal) matchedNormal = item;
        }
    }
    return matchedRoomMsg || matchedNormal || matchedOther;
}

async function isFrontdeskOnline() {
    const heartbeat = await redis.get('heartbeat:frontdesk');
    return !!heartbeat;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
    const { question, room, groupId, checkin, checkout } = req.body || {};
    if (!question) return res.status(400).json({ error: '请输入问题' });

    try {
        const aiSettings = await getAISettings();

        const takeoverData = await redis.get(`takeover:${room}`);
        const isTakeover = takeoverData && (typeof takeoverData === 'object' ? takeoverData.active : JSON.parse(takeoverData).active);

        if (isTakeover) {
            await redis.set(`pending_msg:${room}:${Date.now()}`, JSON.stringify({
                room, sender: 'guest', text: question, time: new Date().toISOString(), groupId: groupId || ''
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
        const lunarDay = ((beijingTime.getTime() / 86400000 + 25569) % 29.53);
        const isSpringTide = (lunarDay < 4 || lunarDay > 25.5 || (lunarDay > 12 && lunarDay < 17));

        let activityHint = '';
        if (hour >= 5 && hour < 8) activityHint = '现在是清晨，可以推荐花竹日出或晨间海滩散步。';
        else if (hour >= 8 && hour < 11) activityHint = '现在是上午，适合小皓赶海或附近沙滩游玩。';
        else if (hour >= 11 && hour < 14) activityHint = '现在是中午，推荐三沙镇海鲜大排档。';
        else if (hour >= 14 && hour < 17) activityHint = '现在是下午，适合高罗沙滩或露台下午茶。';
        else if (hour >= 17 && hour < 19) activityHint = '现在是傍晚，强烈推荐东壁村看日落。';
        else if (hour >= 19 && hour < 22) activityHint = '现在是晚上，可以露台吹风或三沙镇夜宵。';
        else activityHint = '现在是深夜，提醒客人早休息，明早可看日出。';

        let tideHint = isSpringTide ? '近期正值大潮，退潮幅度大，赶海收获会更多哦！' : '目前是小潮期，海滩暴露面积较小，但依然可以享受赶海乐趣。';

        // ★ 计算今日/明日日出时间
        function getSunriseTime(date) {
            const lat = 26.89;
            const lng = 120.16;
            const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
            const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
            const hourAngle = Math.acos(-Math.tan((lat * Math.PI) / 180) * Math.tan((declination * Math.PI) / 180));
            const solarNoon = 12 + (120 - lng) / 15;
            const sunriseHour = solarNoon - (hourAngle * 180) / Math.PI / 15;
            const sunriseUTC = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60));
            return new Date(sunriseUTC.getTime() + 8 * 60 * 60 * 1000);
        }

        const todaySunrise = getSunriseTime(beijingTime);
        const tomorrowDate = new Date(beijingTime);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowSunrise = getSunriseTime(tomorrowDate);

        const sunriseInfo = `
【今日日出时间】${todaySunrise.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
【明日日出时间】${tomorrowSunrise.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
`;

        let systemPrompt = `你是"${aiSettings.name}"，山予海民宿的专属AI管家。

🎭 你的性格特点：
- 热情开朗，像认识很久的朋友一样和客人聊天
- 说话自然随意，偶尔带点俏皮和小幽默
- 善用Emoji表情，让对话更生动活泼 😊🌊✨
- 对于客人的问题，不仅给出答案，还会像朋友一样多分享一些实用小贴士
- 在回答完问题后，可以自然地关心一下客人的需求
- 你叫小予，如果有人叫你其他名字，你会笑着说：“我是小予哦～”

💬 说话风格示例：
- 不用"您好，请问有什么可以帮您"，而用"嘿！有什么想了解的尽管问我～"
- 不用"以下是相关信息"，而用"我跟你说哦，我们家..."
- 不用"感谢您的咨询"，而用"好啦，还有其他想知道的吗？我随时都在～"
- 对话中不用“*来隔开”而用“ 空格来隔开”

📋 当前信息：
现在是北京时间 ${todayStr} ${timeStr}。${activityHint}
${tideHint}
${sunriseInfo}

🧠 你的行程规划引擎（必须严格遵守）：

1. 时间矛盾检测与到达时间判断：
   - 民宿默认入住时间为下午14:00，日落时间约为17:00-19:00（夏季晚，冬季早）。
   - 默认使用当前北京时间判断到达早晚：
     · 14:00-17:00 → "到达较早"，可推荐当天傍晚日落
     · 17:00-19:00 → "到达适中"，日落即将结束，推荐晚上美食
     · 19:00之后 → "到达较晚"，当天日落已过，推荐次日日出
   - ★ 如果客人主动告知实际到达时间（例如“我晚上9点才到”、“我明天才入住”），
     必须以客人告知的时间为准，忽略系统时间。根据客人告知的时间重新判断早晚，
     并说一句“原来你还没到呀，那我重新帮你安排～”之类的话，让客人感到你在认真倾听。
   - 如果客人只住一晚且明天中午12:00退房，明天的日落也无法看（退房后客人已不在民宿），要明确提醒。
   - 如果客人入住多天（非次日退房），即使现在或到达时间较晚，也可以推荐明天的日落及其他景点组合。

2. 行程合理编排：
   - 不仅推荐单一景点，要根据客人的入住天数，给出包含多个景点的合理行程
   - 考虑体力消耗：不要把耗体力的活动（如赶海、爬山）连续安排，中间要穿插轻松的打卡点
   - 考虑时间衔接：景点之间要有合理的通勤时间说明
   - 行程结尾要询问："这个安排你觉得怎么样？会不会太紧凑？想不想调整一下？"

3. 坚持推荐不反问：
   - 如果你主动提出发送导航链接，客人回复"需要"、"好"、"可以"、"嗯"、"OK"等肯定词
   - 你必须直接发送导航链接，禁止再反问"你要民宿定位还是景点导航？"
   - 直接给出发出的承诺信息

📋 行程推荐模板（用于参考）：

【一日游推荐（当天到达，次日退房）】
- 如果到达时间较早：下午东壁村日落 → 晚上三沙镇海鲜 → 次日上午花竹日出 → 退房
- 如果到达时间较晚（下午/傍晚）：晚上三沙镇美食 → 次日上午花竹日出 → 退房

【两日游推荐（入住2晚以上）】
- Day1：傍晚东壁村日落 → 晚上三沙镇海鲜大排档
- Day2：早上花竹日出 → 上午小皓赶海 → 下午高罗沙滩（轻松赏景） → 晚上露台吹海风
- Day3：早餐 → 下尾岛（轻松打卡） → 退房

【核心规则】
1. 只回答与山予海民宿及相关旅游的问题，遇到无关问题礼貌拒绝但语气轻松。
2. 你叫“小予”，如果客人叫错你的名字，要用轻松的语气纠正。
3. 理解客人的同义表达，别太死板。
4. 如果客人问题模糊，像朋友一样追问确认。
5. 每句话都尽量使用第一人称，亲切自然。
6. 遇到需要人工处理的问题，提醒拨打前台 0593-8850999。
7. ★ 当客人询问日出时间时，请直接告知当天的日出时间（根据上面的日出信息），并提醒客人提前30分钟出发前往花竹1号观景台观看日出。最后询问是否需要发送民宿定位或花竹观景台导航链接。
8. ★ 当客人询问“民宿定位”、“民宿导航”、“怎么去民宿”、“民宿地址”等位置问题时，请同时回复民宿的高德导航链接和百度导航链接，并告诉客人可以根据自己手机安装的地图选择点击。两个链接都在【民宿定位与导航】中。
9. ★ 景点定位交互策略：当客人询问旅游攻略、景点推荐，或者你主动推荐景点后，先介绍景点和攻略，然后一定要主动询问：“需要我发给你XX景点的导航链接吗？”如果客人回复肯定，你必须同时给出该景点的高德导航链接和百度导航链接（两个都发，让客人选择），链接从【周边景点定位与导航】表格中获取。
10. 当距离景点的开车时间超过2分钟并在15分钟内那么建议客人可以租用民宿对面的共享电动车使用。当开车时间超过15分钟则建议客人开车前往或者包车前往。
11. 每次回答完问题后，都要自然地追问一句，让对话继续下去。
12. 关于潮汐和赶海时间的建议为估算值，如需最准确信息可回复"呼叫前台"让前台帮您查询。

【重要提醒】
潮汐和赶海时间可能有误差，如需最准确信息，可以帮你呼叫前台哦～需要的话回复"呼叫前台"就OK！

【民宿完整信息】
${hotelInfo}

【补充知识库】
${knowledgeText || '暂无'}`;

        // 退房关怀
        if (checkout) {
            const checkoutDate = checkout.substring(0, 8);
            const todayBeijing = beijingTime.toISOString().slice(0, 10).replace(/-/g, '');
            if (todayBeijing === checkoutDate && hour >= 7) {
                systemPrompt += `\n\n【退房关怀】今天是客人的退房日，请在回答完主要问题后，自然地加上退房相关提醒，语气轻松。`;
            }
        }

        const matched = await matchKeywords(question);
        console.log('关键词匹配结果:', JSON.stringify(matched));

        if (matched && matched.type === 'room_msg') {
            const online = await isFrontdeskOnline();
            console.log('前台在线状态:', online);

            const isWorkingHour = (hour >= 8 && hour < 23);

            if (isWorkingHour) {
                if (online) {
                    await redis.set(`notification:${Date.now()}`, JSON.stringify({
                        room: room || '未知', question, reply: '', keyword: matched.keyword,
                        type: 'room_msg', time: new Date().toISOString(), status: 'pending', groupId: groupId || ''
                    }));
                    await redis.set(`takeover:${room}`, JSON.stringify({
                        active: true, startTime: Date.now(), lastGuestMsg: Date.now(), groupId: groupId || ''
                    }));
                    console.log(`接管房间已设置: takeover:${room}，群组：${groupId || '无'}`);
                    return res.status(200).json({ reply: '好的您稍等，我现在就通知前台的小伙伴与您联系，您不要离开正在接通中请稍候......' });
                } else {
                    return res.status(200).json({
                        reply: '接通失败~当前前台的小伙伴不在线，您可以稍后再试，或者拨打前台电话联系前台。前台电话为：0593-8850999'
                    });
                }
            } else {
                if (online) {
                    await redis.set(`notification:${Date.now()}`, JSON.stringify({
                        room: room || '未知', question, reply: '', keyword: matched.keyword,
                        type: 'room_msg', time: new Date().toISOString(), status: 'pending', groupId: groupId || ''
                    }));
                    await redis.set(`takeover:${room}`, JSON.stringify({
                        active: true, startTime: Date.now(), lastGuestMsg: Date.now(), groupId: groupId || ''
                    }));
                    console.log(`接管房间已设置（下班时间前台在线）: takeover:${room}，群组：${groupId || '无'}`);
                    return res.status(200).json({ reply: '好的您稍等，我现在就通知前台的小伙伴与您联系，您不要离开正在接通中请稍候......' });
                } else {
                    return res.status(200).json({
                        reply: '我们前台的小伙伴们都下班啦！目前是下班时间，有什么问题您可以先问我我可以帮您处理的。上班时间：8:00-23:00'
                    });
                }
            }
        }

        if (matched && matched.reply) {
            let replyBody = matched.reply;
            let instruction = '';
            const bracketMatch = matched.reply.match(/（([^）]+)）/);
            if (bracketMatch) {
                replyBody = matched.reply.replace(/（[^）]+）/, '').trim();
                instruction = bracketMatch[1];
            }
            if (replyBody) systemPrompt += `\n\n【回复要点】请用朋友聊天的语气回复：${replyBody}`;
            if (instruction) systemPrompt += `\n【回复指示】请严格遵循以下要求来调整回复的语气、风格或内容：${instruction}`;
        }

        const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.VOLCENGINE_API_KEY}`
            },
            body: JSON.stringify({
                model: 'ep-m-20260521173515-xfdzp',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                temperature: 0.8,
                max_tokens: 800
            })
        });

        const data = await response.json();
        if (data.error) return res.status(500).json({ error: 'AI异常：' + data.error.message });
        const content = data?.choices?.[0]?.message?.content;
        if (!content) return res.status(500).json({ error: 'AI无返回' });
        let reply = content;

        const unsurePhrases = ['不太确定', '无法回答', '这个我不太清楚', '抱歉，我暂时无法',
            '建议您拨打前台', '您可以咨询前台', '暂时无法提供', '我也不太了解'];
        if (unsurePhrases.some(phrase => reply.includes(phrase))) {
            await redis.set(`unanswered:${Date.now()}`, JSON.stringify({
                question, room: room || '', time: new Date().toISOString(), status: 'pending'
            }));
            reply = aiSettings.fallbackReply.replace('{name}', aiSettings.name).replace('{phone}', '0593-8850999').replace('{room}', room || '');
            if (aiSettings.fallbackNote) reply += '\n' + aiSettings.fallbackNote;
        }

        const chatKey = `chat:${Date.now()}:${Math.random().toString(36).substr(2,6)}`;
        await redis.set(chatKey, JSON.stringify({
            room: room || '未知',
            groupId: groupId || '',
            question,
            reply,
            time: new Date().toISOString()
        }));
        await redis.expire(chatKey, 60 * 60 * 24 * 90);

        if (matched && matched.type !== 'other' && matched.type !== 'room_msg') {
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
