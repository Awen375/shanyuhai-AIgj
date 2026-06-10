# 山予海 AI 管家系统 - Code Wiki

---

## 1. 项目概览

**项目名称**：山予海 AI 管家（shanyuhai-ai-butler）

**项目定位**：面向民宿房客的智能对话管家系统，提供 7×24 小时 AI 客服、前台人工接管、房间管理、通知中心等一体化服务。

**技术栈**：
- 前端：原生 HTML + CSS + JavaScript（无框架）
- 后端 API：Node.js + ES Modules（Edge Runtime 风格）
- 数据存储：Redis（ioredis 客户端，本地连接 + Upstash 兼容模式）
- AI 引擎：火山方舟（Volcengine Ark）LLM API
- 部署模式：静态页面 + Serverless API 目录结构

---

## 2. 系统架构总览

### 2.1 三层角色模型

```
┌──────────────────────────────────────────────────────────┐
│                     访客 (Guest)                          │
│  扫码进入房间 → room-chat.html → 与AI对话 / 呼叫前台       │
│                  访问 API: /api/ai-chat, /api/check_room, │
│                          /api/frontdesk (guest 只读)       │
├──────────────────────────────────────────────────────────┤
│                     前台 (Frontdesk)                       │
│  frontdesk.html → 房客消息实时推送 / 人工接管对话 /         │
│               清扫/用车/订餐等任务通知 / 临时二维码         │
│                  访问 API: /api/frontdesk (密码验证)       │
├──────────────────────────────────────────────────────────┤
│                      管理员 (Admin)                        │
│  admin.html → 房间管理 / AI设置 / 关键词配置 /             │
│              聊天记录查看 / 未回答问题处理 / 语音设置        │
│                  访问 API: /api/admin/* (x-admin-token)    │
└──────────────────────────────────────────────────────────┘
```

### 2.2 数据流转核心链路

```
房客提问
   ↓
/api/ai-chat
   ↓
┌─ 关键词命中? → room_msg 类型 ─→ takeover:${room} ── 通知前台接管
│                        └→ notification:${ts}     实时推送
│
└─ 未命中关键词 ─→ 火山方舟 LLM 调用 (systemPrompt + hotelInfo)
        ├─ 正常回答 → chat:${ts}:${rand} 存储（90天TTL）
        └─ 无法回答 → unanswered:${ts} 进入人工处理队列
```

---

## 3. 目录结构与文件职责

```
/workspace/
├── index.html              # 首页 + 管理员后门入口（连点标题5次）
├── admin.html              # 管理员后台（房间/AI/关键词/聊天记录/通知）
├── frontdesk.html          # 前台工作台（实时消息/任务通知/临时二维码）
├── room-chat.html          # 房客端聊天界面（扫码进入）
├── package.json            # 依赖声明（ioredis + @upstash/redis）
├── qrcode.min.js           # QR 码生成库（静态资源）
├── message.mp3             # 新消息提示音
├── logo.jpg / aimx.jpg     # 品牌图片资源
└── api/
    ├── ai-chat.js          # AI 对话核心（LLM 调用 + 关键词 + 接管）
    ├── check_room.js       # 房间身份验证（token + 时效 + 群组成效）
    ├── frontdesk.js        # 前台端 API（消息/通知/临时二维码/心跳）
    ├── room.js             # 房间验证备用接口（Upstash 兼容模式）
    └── admin/
        └── [...action].js  # 管理员统一路由（CRUD 房间/配置/聊天记录）
```

---

## 4. Redis Key 命名空间与数据模型

| Key 模式 | 用途 | 核心字段 | TTL |
|---------|------|---------|-----|
| `room:${roomId}` | 房间元信息 | `{id, name, token, status, createdAt}` | 永久 |
| `temp_qr:${groupId}` | 临时时效二维码 | `{roomId, roomName, token, checkin, checkout, status}` | 永久 |
| `config:ai` | AI 管家配置 | `{name, fallbackReply, fallbackNote}` | 永久 |
| `config:keywords` | 关键词匹配规则 | `[{keyword, type, reply}]` 数组 | 永久 |
| `config:frontdesk_password` | 前台端密码 | 字符串（默认 `1234`） | 永久 |
| `config:voice` | 前台语音朗读设置 | 字符串（浏览器 SpeechSynthesis voice name） | 永久 |
| `chat:${ts}:${rand}` | 单条聊天记录 | `{room, groupId, question, reply, sender, time}` | 90天 |
| `pending_msg:${room}:${ts}` | 前台接管期间消息缓冲 | `{room, sender, text, time, groupId}` | 永久 |
| `takeover:${room}` | 前台接管标记 | `{active, startTime, lastGuestMsg, groupId}` | 永久 |
| `notification:${ts}` | 任务通知队列 | `{room, question, reply, keyword, type, time, status, groupId}` | 永久 |
| `unanswered:${ts}` | AI 未回答问题队列 | `{question, room, time, status, answer, resolvedAt}` | 永久 |
| `heartbeat:frontdesk` | 前台在线心跳 | 字符串 `1` | 60s |
| `knowledge:${ts}` | 补充知识库（从未回答问题沉淀） | `{question, answer}` | 永久 |

**关键词 type 枚举**：
- `room_msg` → 房客消息/需人工介入 → 触发前台接管
- `clean` → 清扫任务通知
- `car` → 用车服务通知
- `food` → 订餐服务通知
- `extend` → 续住需求通知
- `other` → 其他自定义关键词

---

## 5. 核心模块详解

### 5.1 AI 对话引擎 ([ai-chat.js](file:///workspace/api/ai-chat.js))

**核心流程**：

1. **身份判断**：检查 `takeover:${room}`，若已被前台接管 → 消息写入 `pending_msg`，不调用 LLM
2. **系统提示构建**：
   - 当前北京时间、活动时段建议（清晨/上午/中午/下午/傍晚/晚上/深夜）
   - 潮汐判断（大潮期 vs 小潮期）
   - 日出时间（基于经纬度 26.89°N, 120.16°E 近似计算）
   - 客人入住/退房信息（含天数）
   - 硬编码民宿信息 `hotelInfo`（约 300+ 行，含周边景点双导航链接）
   - 动态知识库 `knowledge:*`（管理员补充的问答对）
3. **关键词匹配**：`matchKeywords()` 扫描问题文本，命中 `room_msg` 类型直接进入接管流程
4. **LLM 调用**：
   - 模型：`ep-20260606133152-72n4l`（火山方舟部署 ID）
   - API：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
   - 参数：`temperature=0.8`, `max_tokens=800`
   - 鉴权：`Authorization: Bearer ${VOLCENGINE_API_KEY}`（环境变量）
5. **未回答降级**：检测回复中含"不太确定/无法回答/建议您拨打前台"等短语 → 写入 `unanswered:*` 队列，返回 `fallbackReply`
6. **通知触发**：命中非 `room_msg`/非 `other` 类型关键词 → 写入 `notification:*` 供前台处理
7. **消息落盘**：`chat:${ts}:${rand}` 存储 90 天

**关键函数**：
- `getAISettings()` — 读取 AI 配置
- `matchKeywords(text)` — 关键词规则引擎
- `isFrontdeskOnline()` — 检查前台心跳
- `handler(req, res)` — 主入口（仅允许 POST）

---

### 5.2 房间身份验证 ([check_room.js](file:///workspace/api/check_room.js))

**四层验证逻辑**：

1. **房间存在性**：`room:${room}` 是否存在
2. **Token 匹配**：请求 token 与 Redis 存储是否一致
3. **临时二维码状态**（带 `groupId` 时）：
   - `temp_qr:${groupId}` 必须存在且 `status !== 'disabled'`
4. **时效验证**（带 `checkin`/`checkout` 时）：
   - 当前时间 < checkin → `reason: 'waiting'`
   - 当前时间 >= checkout → `reason: 'expired'`

**时间格式约定**：`YYYYMMDDHHmm`（12位纯数字，北京时间）

---

### 5.3 前台端 API ([frontdesk.js](file:///workspace/api/frontdesk.js))

统一入口，通过 `action` 参数路由：

| action | 方法 | 权限 | 功能 |
|--------|------|------|------|
| `heartbeat` | GET | 公开 | 更新前台在线心跳（60s TTL） |
| `online_status` | GET | 公开 | 返回前台在线状态（房客端可见） |
| `get_voice` | GET | 公开 | 读取前台语音配置 |
| `main` | GET | 前台密码 | 首页看板数据（今日使用房间 + 待处理通知） |
| `notifications` | GET | 前台密码 | 按类型拉取待处理通知/历史通知 |
| `notifications` | POST | 前台密码 | 标记通知为已处理 |
| `takeover_rooms` | GET | 前台密码 | 需人工回复的房间列表（含未读计数） |
| `chat_messages` | GET | 前台密码 / guest | 按 room+groupId 拉取聊天消息（支持 `since` 增量） |
| `send_msg` | POST | 前台密码 | 前台发送消息（写入 chat:*，清除 pending_msg） |
| `end_takeover` | POST | 前台密码 | 结束接管（删除 takeover:*，写入系统告别消息） |
| `rooms` | GET | 前台密码 | 获取房间列表（供生成临时二维码时验证） |
| `refresh_room` | POST | 前台密码 | 重置房间 token |
| `temp_qrs` | GET | 前台密码 | 列出所有激活的临时二维码 |
| `create_temp_qr` | POST | 前台密码 | 创建时效二维码（生成 groupId） |
| `delete_temp_qr` | POST | 前台密码 | 禁用二维码（status → disabled） |

**核心辅助函数**：
- `checkPassword(password)` — 验证前台密码
- `scanKeys(pattern)` — SCAN 游标遍历 Redis Key（避免 KEYS 阻塞）

---

### 5.4 管理员 API ([api/admin/[...action].js](file:///workspace/api/admin/[...action].js))

**统一鉴权**：HTTP Header `x-admin-token` === `zjm1314520`

| action | 功能 |
|--------|------|
| `rooms` (GET/POST/DELETE) | 房间 CRUD |
| `rooms/refresh` (POST) | 重置房间 token |
| `ai-settings` (GET/POST) | AI 名称/兜底回复配置 |
| `unanswered` (GET/POST) | 查看/回答未解决问题（回答后会沉淀为知识库） |
| `chat-summary` (GET) | 按房间汇总聊天记录（最后时间+条数） |
| `chatlogs` (GET/DELETE) | 按房间+日期筛选聊天记录 |
| `keywords` (GET/POST) | 关键词规则 CRUD |
| `notifications` (GET/POST) | 管理员通知列表/标记已处理 |
| `notifications-history` (GET) | 已处理通知历史 |
| `frontdesk-password` (GET/POST) | 设置前台端密码 |
| `voice` (GET/POST) | 前台语音选择 |

---

### 5.5 房客聊天页面 ([room-chat.html](file:///workspace/room-chat.html))

**交互流程**：

1. **启动验证**：点击"开始智能之旅" → 调用 `/api/check_room`
2. **消息发送**：输入问题 → POST `/api/ai-chat` → 立即本地追加
3. **轮询更新**：每 5 秒调用 `/api/frontdesk?action=chat_messages&room=...&since=...` 获取前台人工回复
4. **导航智能识别**：解析 AI 回复中的高德/百度地图链接 → 转为"📍 选择导航地图"按钮（双链接场景）或"📍 点击导航"按钮（单链接）
5. **状态指示**：每 15 秒检查前台在线状态（绿点/红点）
6. **快捷按钮**：内置 6 个常用问题快捷按钮（早餐/WiFi/景点/退房/接送/呼叫前台）

**防重复机制**：
- `messageKeys` Set 去重
- `recentSentTexts` 避免 10 秒内用户重复文本
- `lastAIReply` 避免 AI 重复返回相同答案

---

### 5.6 前台工作台 ([frontdesk.html](file:///workspace/frontdesk.html))

**核心特性**：

1. **仪表盘卡片**：今日使用房间数、房客消息、清扫/用车/订餐/续住 4 类任务计数
2. **实时心跳**：登录成功后每分钟发送 heartbeat
3. **房客消息接管**：
   - 命中 `room_msg` 关键词 → 前台页面有房客消息，立即弹窗 + 语音播报
   - 点击进入聊天模式 → 实时轮询（15s 刷新）消息
   - 发送消息走 `send_msg`，清除 `pending_msg:*`
4. **快捷回复**：本地 localStorage 存储自定义短语
5. **临时二维码**：生成带入住/退房时效的二维码，过期自动失效
6. **结束接管**：删除 `takeover:${room}` 并发送系统告别消息

---

### 5.7 管理员后台 ([admin.html](file:///workspace/admin.html))

**功能板块**（全部折叠式布局）：

1. **中控数据台**：关键词配置 + 语音选择 + 通知徽章
2. **房间管理**：新增/删除房间，查看/刷新二维码（使用 `api.qrserver.com` 生成）
3. **AI 管家设置**：名称 + 未回答回复模板 + 额外提示
4. **未解决问题**：查看 AI 无法回答的问题，人工回复后自动进入知识库
5. **聊天记录**：按房间分组查看，支持按日期筛选、单条删除
6. **前台端密码**：独立设置（默认 `1234`）

**通知检查**：每 30 秒轮询 `/api/admin/notifications`，新增时语音播报。

---

## 6. API 接口总览

### 6.1 房客端（公开）

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| GET | `/api/check_room?room=&token=&checkin=&checkout=&groupId=` | URL 参数 | 房间身份+时效验证 |
| POST | `/api/ai-chat` | 无（匿名） | 发送问题获取 AI 回复 |
| GET | `/api/frontdesk?action=online_status` | 无 | 前台在线状态 |
| GET | `/api/frontdesk?password=guest&action=chat_messages&room=` | guest 只读 | 拉取聊天消息（轮询用） |

### 6.2 前台端（密码保护）

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| GET | `/api/frontdesk?password=&action=main` | 前台密码 | 仪表盘数据 |
| GET | `/api/frontdesk?password=&action=notifications&type=` | 前台密码 | 通知列表 |
| POST | `/api/frontdesk` {action:'notifications', id, password} | 前台密码 | 标记通知已处理 |
| GET | `/api/frontdesk?password=&action=takeover_rooms` | 前台密码 | 接管房间列表 |
| POST | `/api/frontdesk` {action:'send_msg', room, text, groupId, password} | 前台密码 | 发送人工消息 |
| POST | `/api/frontdesk` {action:'end_takeover', room, password} | 前台密码 | 结束接管 |
| POST | `/api/frontdesk` {action:'create_temp_qr', ..., password} | 前台密码 | 创建时效二维码 |
| POST | `/api/frontdesk` {action:'delete_temp_qr', groupId, password} | 前台密码 | 禁用二维码 |

### 6.3 管理员端（Token 鉴权）

所有请求需带 Header：`x-admin-token: zjm1314520`

| 方法 | 路径 | 用途 |
|------|------|------|
| GET/POST/DELETE | `/api/admin/rooms` | 房间 CRUD |
| POST | `/api/admin/rooms/refresh` | 重置房间 token |
| GET/POST | `/api/admin/ai-settings` | AI 配置 |
| GET/POST | `/api/admin/unanswered` | 未回答问题处理 |
| GET | `/api/admin/chat-summary` | 聊天记录汇总 |
| GET/DELETE | `/api/admin/chatlogs?room=&date=` | 聊天记录查询/删除 |
| GET/POST | `/api/admin/keywords` | 关键词规则 |
| GET/POST | `/api/admin/notifications` | 通知列表/标记已处理 |
| GET | `/api/admin/notifications-history` | 已处理通知历史 |
| GET/POST | `/api/admin/frontdesk-password` | 前台密码设置 |
| GET/POST | `/api/admin/voice` | 语音配置 |

---

## 7. 关键业务流程

### 7.1 房客呼叫前台流程

```
房客发送"呼叫前台"/"需要帮助"
   ↓
POST /api/ai-chat
   ↓
关键词匹配 → 命中 type=room_msg
   ↓
前台在线? 是
   ↓
写入 takeover:${room} = {active:true, groupId}
写入 notification:${ts} = {type:'room_msg', status:'pending'}
   ↓
返回"正在通知前台..."给房客
   ↓
前台页面每 15s 轮询 takeover_rooms → 发现新房间 → 自动弹窗 + 语音播报
   ↓
前台点击进入聊天 → 读取 pending_msg:* 缓冲区消息
   ↓
前台回复 → send_msg → chat:* 记录
   ↓
前台点击"结束对话" → 删除 takeover:${room} + 写入告别消息
```

### 7.2 临时二维码生命周期

```
前台在 frontdesk.html 填写 房间号+入住+退房时间
   ↓
create_temp_qr → 生成 groupId = ${ts}-${rand8}
   ↓
写入 temp_qr:${groupId} = {roomId, roomName, token, checkin, checkout, status:'active'}
   ↓
生成二维码链接：/room-chat.html?room=X&token=Y&checkin=YYYYMMDDHHmm&checkout=...&groupId=...
   ↓
房客扫码 → check_room 验证：
   - 当前时间 < checkin → waiting 等待页
   - 当前时间 >= checkout → expired 告别页
   - temp_qr 状态为 disabled → disabled 停用页
   ↓
前台可主动 delete_temp_qr → status='disabled'（立即失效）
```

---

## 8. 安全与鉴权设计

| 层级 | 机制 | 注意事项 |
|------|------|---------|
| 管理员 | Header `x-admin-token` 比对硬编码密码 `zjm1314520` | **硬编码在前端和 API 中**，生产环境强烈建议替换 |
| 前台端 | 独立密码存储于 `config:frontdesk_password`，默认 `1234` | 明文传输与存储，建议哈希 + HTTPS |
| 房客端 | 房间 token + 可选 groupId 双层验证 | token 仅在刷新/删除时失效 |
| 时效控制 | checkin/checkout 时间窗校验 | 基于北京时间（Asia/Shanghai） |
| 消息读取 | guest 密码仅允许拉取本房间消息（只读） | 不允许写入 |

**⚠️ 安全硬编码警告**：
- `index.html` L105、`admin.html` L217、`admin/[...action].js` L5 中硬编码 `zjm1314520`
- `/api/ai-chat.js` L4 硬编码 Redis 连接串 `redis://:Cjw1314520@127.0.0.1:6379`
- 生产环境必须改为环境变量注入

---

## 9. 运行方式与依赖

### 9.1 安装依赖

```bash
cd /workspace
npm install
```

依赖包（见 [package.json](file:///workspace/package.json)）：
- `ioredis` — 主要 Redis 客户端（本地部署用）
- `@upstash/redis` — Upstash HTTP API 兼容客户端（[room.js](file:///workspace/api/room.js) 使用，依赖 `KV_REST_API_URL`/`KV_REST_API_TOKEN` 环境变量）

### 9.2 环境变量

| 变量 | 用途 |
|------|------|
| `VOLCENGINE_API_KEY` | 火山方舟 API 密钥（**必须**，否则 AI 调用失败） |
| `KV_REST_API_URL` | Upstash Redis REST URL（仅 [room.js](file:///workspace/api/room.js) 使用） |
| `KV_REST_API_TOKEN` | Upstash Redis REST Token（同上） |

### 9.3 Redis 部署

本项目使用本地 Redis 服务（默认端口 6379），需启用持久化（AOF 或 RDB）以保留房间/配置数据。

### 9.4 托管与运行

API 文件遵循 Vercel / Netlify Functions 风格的 handler 签名（`export default async function handler(req, res)`）：

- **Vercel 部署**：将 `/api` 目录作为 `api/` 目录，`package.json` 放在根目录
- **其他 Serverless 平台**：需适配事件对象 → (req, res) 的转换
- **本地开发**：使用 `vercel dev` 或 `netlify dev`，或自行用 Express 包装 handler

### 9.5 管理员入口

访问 `index.html` → 连续点击页面标题 5 次 → 弹窗输入管理员密码（默认 `zjm1314520`）→ 跳转 `/admin.html`

---

## 10. 核心常量与配置要点

| 常量 | 值 | 位置 | 说明 |
|------|-----|------|------|
| 管理员密码 | `zjm1314520` | 多处硬编码 | 全局 admin token |
| 前台默认密码 | `1234` | frontdesk.js L6 | 可在 admin 后台修改 |
| AI 默认名称 | `小予` | ai-chat.js L136 | 可在 admin 后台修改 |
| 聊天记录 TTL | 7776000s (90 天) | ai-chat.js L492, frontdesk.js L208, L231 | 历史数据自动过期 |
| 前台心跳 TTL | 60s | frontdesk.js L33 | 超时即判定离线 |
| 房客端轮询间隔 | 5000ms | room-chat.html (pollNewMessages) | 新消息检查 |
| 前台轮询接管房间 | 15000ms | frontdesk.html L574 | 新消息发现 |
| 管理员通知轮询 | 30000ms | admin.html L680 | 通知徽章刷新 |
| LLM temperature | 0.8 | ai-chat.js L443 | 回复随机性 |
| LLM max_tokens | 800 | ai-chat.js L444 | 单次回复最大 token |
| 民宿经纬度 | 26.89°N, 120.16°E | ai-chat.js L230 | 日出时间计算基准 |

---

## 11. 已知设计权衡与改进空间

1. **Redis KEYS 命令**：管理员接口大量使用 `redis.keys('pattern')`，在大数据量下会阻塞主线程。前台端 `frontdesk.js` 已改用 SCAN，建议管理员端同步迁移
2. **消息排序**：`chat:*` 通过 timestamp+随机后缀命名，无索引，查询需遍历所有 key。可增加 `chat_idx:${room}` 有序集合加速
3. **密码明文**：管理员/前台密码均为明文比对，建议改为 bcrypt/argon2
4. **CORS 缺失**：API 无 CORS headers，仅同源访问有效。跨域部署需在 handler 开头添加
5. **硬编码模型 ID**：`ep-20260606133152-72n4l` 需配置化
6. **并发接管**：同一房间可被多个前台浏览器打开，消息无乐观锁
7. **民宿信息硬编码**：`hotelInfo` 300+ 行嵌入源码，应抽取到 Redis `config:hotel_info` 由管理员编辑
8. **LLM 超时/重试**：当前无重试机制，网络抖动会导致 500 错误
9. **前端无构建**：HTML 文件内嵌大量 `<script>` 逻辑，代码已达 500-600 行/文件，建议拆分为模块化 JS

---

## 12. 模块调用关系图

```
              ┌─────────────────┐
              │  room-chat.html  │──────┐
              └─────────────────┘      │
                      │                  │
     ┌────────────────┼────────────────┐│
     │                │                ││
     ▼                ▼                ▼│
check_room.js    ai-chat.js ◄──►  frontdesk.js
     │                │     消息轮询    ▲
     │         关键词/接管               │
     │                │                 │
     │       ┌────────┴─────────┐       │
     │       ▼                  ▼       │
     │  notification:*    takeover:*    │
     │  unanswered:*       pending_msg:* │
     │                                  │
     └──────────────────────────────────┘

              ┌──────────────┐
              │  admin.html  │
              └──────┬───────┘
                     ▼
           admin/[...action].js
              (统一 CRUD 路由)
                     │
    ┌────────┬───────┼───────┬────────┐
    ▼        ▼       ▼       ▼        ▼
  room:*  config:*  chat:*  notification:*
           knowledge:*      unanswered:*
```

---

*本文档基于 `/workspace` 目录源码生成，代码引用均指向实际文件路径，可作为开发、运维和二次开发的完整参考手册。*
