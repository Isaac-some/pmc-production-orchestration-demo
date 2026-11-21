# 项目中枢 · 生产编排演示

用于体验运动感知 POC：持续来源登记、缓冲池放行、大视频压缩新线路、补充生产线、Agent失败转人工、离线CSV回传与交付留存。

所有姓名、客户、项目数据、平台对象与TOS地址均为虚构示例。各访问者的数据仅保存在自己的浏览器；不会连接真实业务平台。不要在公开演示中输入真实敏感数据。

GitHub Actions构建并发布到GitHub Pages。进入项目列表→运动感知→生产流程编排。

本地运行：

```sh
cd pmc-production-orchestration-demo
npm ci
VITE_PUBLIC_DEMO=true npm run dev
```
