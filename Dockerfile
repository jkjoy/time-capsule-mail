# 使用官方的 Node.js 镜像作为基础镜像
FROM node:20

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用程序代码
COPY public ./public
COPY app.js ./
COPY init-db.js ./
COPY config.js ./
COPY start.js ./

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production

# 启动应用程序
CMD ["node", "start.js"]