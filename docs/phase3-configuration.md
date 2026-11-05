# 服务端配置 — Key按要求留空

当前 `.env.example` 的模型Key、端点和模型名均为空，开关为false。无需填写任何密钥即可体验规则诊断与营销草稿。
服务端不读取OPENAI_API_KEY，不会拿环境中的其他凭据自动调用模型。

以后由你决定接入时，使用工程根目录的 `.env.local`；这个文件只由本地服务读取，不在浏览器中填写，不可放进preview文件夹或提交到Git。

| 变量 | 当前值/作用 |
|---|---|
| LIXIAHE_MODEL_ENABLED | false；必须显式开启 |
| LIXIAHE_MODEL_API_KEY | 空；没有它始终走规则 |
| LIXIAHE_MODEL_BASE_URL | 空；将来可配置兼容Chat Completions的HTTPS API根路径，通常含/v1 |
| LIXIAHE_MODEL_NAME | 空；由将来选定的服务商提供，不预置失效模型名 |
| LIXIAHE_MODEL_TIMEOUT_MS | 默认12000，可设1000—30000 |
| LIXIAHE_MODEL_DAILY_CALLS | 默认20；本地单进程每天最多的传输尝试数，不是人民币账单上限 |

本轮不提供、不创建或验证真实Key，不会发送真实模型请求。模拟测试不证明任意提供商的协议兼容性或真实效果。
配置后还需在界面显式勾选“本次允许已配置模型处理汇总指标”，才能调用。修改配置需重启服务。
服务商需支持 `POST /chat/completions`、messages、response_format=json_object和max_tokens；不支持时会降级为规则，不能据此认定密钥无效。
不要把服务端密钥写成NEXT_PUBLIC变量，也不要复制进浏览器代码、日志或聊天消息。
