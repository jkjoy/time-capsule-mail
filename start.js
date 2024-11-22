const initDatabase = require('./init-db');
const app = require('./app');

const port = process.env.PORT || 3000;

// 初始化数据库
initDatabase().then(() => {
}).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});