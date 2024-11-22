const initDatabase = require('./init-db');
const app = require('./app');

// 初始化数据库
initDatabase().then(() => {
    // 启动应用程序
    app.listen(process.env.PORT || 3000, () => {
        console.log(`Server is running on port ${process.env.PORT || 3000}`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});