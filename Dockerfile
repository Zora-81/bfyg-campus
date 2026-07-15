# 宝丰一高校园频道 Dockerfile
FROM node:22-alpine

WORKDIR /app

# 依赖
COPY server/package.json server/package-lock.json ./
RUN npm ci --only=production

# 服务端
COPY server/ ./

# 前端静态文件
COPY html/ /app/html/
COPY css/ /app/css/
COPY js/ /app/js/
COPY images/ /app/images/

# 将 anime.js 浏览器版复制到前端 js 目录（npm 依赖已在 node_modules 中）
RUN cp node_modules/animejs/lib/anime.min.js /app/js/anime.min.js

EXPOSE 3000
CMD ["node", "index.js"]
