# InsForge 迁移计划（选项 1）

> 创建日期：2026-07-16
> 目标：将校园频道从 SQLite/Express 迁移到 InsForge + 独立 WebSocket
> 预估工期：2 周

---

## 一、方案概述

**目标架构：**
- **后端平台**：InsForge（提供 Auth + PostgreSQL + S3 存储 + 边缘函数）
- **实时通信**：独立 Socket.io 服务（保持不变，只需改连接地址）

**核心变更：**
| 模块 | 当前 | 迁移后 | 改动量 |
|------|------|-------|--------|
| 数据库 | SQLite | PostgreSQL | 小 |
| 认证 | JWT 自研 | InsForge Auth | 中 |
| 存储 | 本地磁盘 | S3 桶 | 小 |
| API | Express | 边缘函数 | 中 |
| WebSocket | Socket.io | Socket.io（不变） | 几乎不改 |

---

## 二、实施步骤

### 第一阶段：环境准备（第 1-2 天）

1. 安装 InsForge 本地开发环境
   - git clone https://github.com/InsForge/InsForge.git
   - docker compose -f docker-compose.prod.yml up -d
   - 访问 http://localhost:7130 确认服务正常

2. 配置 InsForge 项目
   - 创建 PostgreSQL 数据库实例
   - 创建 S3 存储桶（campus-uploads）
   - 启用用户注册/登录功能

3. 安装 InsForge SDK
   - 
pm install @insforge/sdk

### 第二阶段：后端迁移（第 3-5 天）

1. **迁移认证模块**
   - 重写 /api/register、/api/login、/api/profile 等接口
   - 使用 InsForge Auth SDK 替代自研 JWT

2. **迁移数据库操作**
   - 创建 PostgreSQL 表结构（users, channels, messages 等）
   - 编写数据迁移脚本（SQLite -> PostgreSQL）
   - 更新所有数据库查询代码

3. **迁移文件上传**
   - 修改上传逻辑使用 InsForge S3 SDK
   - 更新前端文件预览组件

### 第三阶段：前端适配（第 6-8 天）

1. 引入 InsForge SDK
2. 重写所有 REST API 调用（auth/channels/messages/uploads）
3. WebSocket 部分只改连接地址，其余逻辑不变
4. 测试所有功能

### 第四阶段：WebSocket 部署（第 9-10 天）

1. 配置独立 Socket.io 服务器（Docker 容器）
2. 编写 Dockerfile 和 docker-compose.yml
3. 配置 CORS 和跨域设置
4. 测试 WebSocket 连接稳定性

### 第五阶段：测试上线（第 11-14 天）

1. 功能测试：注册/登录/聊天/上传/后台管理
2. 性能测试：并发连接/消息延迟/数据库查询
3. 部署到 CloudBase 或 VPS
4. 配置域名和 SSL

---

## 三、注意事项

1. **数据迁移**：需编写脚本将 SQLite 数据导入 PostgreSQL
2. **API 兼容性**：确保前端调用与新 API 兼容
3. **WebSocket 配置**：需正确配置 CORS
4. **备份策略**：迁移前务必备份现有数据

---

## 四、验收标准

- [ ] 用户注册/登录正常
- [ ] 实时聊天稳定运行
- [ ] 文件上传/下载正常
- [ ] 后台管理功能完整
- [ ] 移动端响应式布局正常
- [ ] API 响应时间 < 200ms
- [ ] 支持 100+ 并发用户

---

*总工期约 2 周，可根据实际情况调整。*