const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 从环境变量中读取数据库路径
const dbPath = process.env.DB_PATH || path.join(__dirname, './data/future_mails.db');

// 检查数据库文件是否存在
const dbExists = fs.existsSync(dbPath);

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Database connected successfully');
});

// 创建表的函数
const createTables = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            try {
                // 开启外键约束
                db.run('PRAGMA foreign_keys = ON');

                // 创建邮件表
                db.run(`
                    CREATE TABLE IF NOT EXISTS future_mails (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        email TEXT NOT NULL,
                        content TEXT NOT NULL,
                        send_time DATETIME NOT NULL,
                        timezone TEXT NOT NULL,
                        verification_code TEXT NOT NULL,
                        security_code TEXT NOT NULL,
                        is_verified INTEGER DEFAULT 0,
                        is_sent INTEGER DEFAULT 0,
                        is_cancelled INTEGER DEFAULT 0,  -- 新增取消状态字段
                        retry_count INTEGER DEFAULT 0,
                        max_retries INTEGER DEFAULT 3,   -- 新增最大重试次数字段
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        verified_at DATETIME,
                        sent_at DATETIME,
                        cancelled_at DATETIME,          -- 新增取消时间字段
                        last_retry_at DATETIME          -- 新增上次重试时间字段
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating future_mails table:', err);
                        reject(err);
                    } else {
                        console.log('future_mails table created successfully');
                    }
                });

                // 创建发送日志表
                db.run(`
                    CREATE TABLE IF NOT EXISTS mail_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        mail_id INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        message TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(mail_id) REFERENCES future_mails(id) ON DELETE CASCADE
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating mail_logs table:', err);
                        reject(err);
                    } else {
                        console.log('mail_logs table created successfully');
                    }
                });

                // 创建IP限制表
                db.run(`
                    CREATE TABLE IF NOT EXISTS rate_limits (
                        ip TEXT PRIMARY KEY,
                        last_attempt DATETIME NOT NULL,
                        attempt_count INTEGER DEFAULT 1,
                        blocked_until DATETIME,         -- 新增封禁时间字段
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating rate_limits table:', err);
                        reject(err);
                    } else {
                        console.log('rate_limits table created successfully');
                    }
                });
                
                // 创建索引
                db.run(`CREATE INDEX IF NOT EXISTS idx_future_mails_send_time ON future_mails(send_time)`, (err) => {
                    if (err) {
                        console.error('Error creating idx_future_mails_send_time index:', err);
                        reject(err);
                    } else {
                        console.log('idx_future_mails_send_time index created successfully');
                    }
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_future_mails_email ON future_mails(email)`, (err) => {
                    if (err) {
                        console.error('Error creating idx_future_mails_email index:', err);
                        reject(err);
                    } else {
                        console.log('idx_future_mails_email index created successfully');
                    }
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_mail_logs_mail_id ON mail_logs(mail_id)`, (err) => {
                    if (err) {
                        console.error('Error creating idx_mail_logs_mail_id index:', err);
                        reject(err);
                    } else {
                        console.log('idx_mail_logs_mail_id index created successfully');
                    }
                });
                db.run(`CREATE INDEX IF NOT EXISTS idx_rate_limits_last_attempt ON rate_limits(last_attempt)`, (err) => {
                    if (err) {
                        console.error('Error creating idx_rate_limits_last_attempt index:', err);
                        reject(err);
                    } else {
                        console.log('idx_rate_limits_last_attempt index created successfully');
                    }
                });

                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
};

// 清理过期的速率限制记录
const cleanRateLimits = () => {
    return new Promise((resolve, reject) => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        db.run('DELETE FROM rate_limits WHERE last_attempt < ?', thirtyDaysAgo.toISOString(), (err) => {
            if (err) {
                console.error('Error cleaning rate_limits table:', err);
                reject(err);
            } else {
                console.log('Rate limits cleaned successfully');
                resolve();
            }
        });
    });
};

// 执行数据库初始化
const initDatabase = async () => {
    try {
        if (!dbExists) {
            await createTables();
            console.log('Database tables created successfully');
        } else {
            console.log('Database already exists, skipping table creation');
        }
        
        await cleanRateLimits();
        
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            }
            console.log('Database connection closed');
        });
    } catch (err) {
        console.error('Database initialization failed:', err);
        process.exit(1);
    }
};

// 导出初始化函数
module.exports = initDatabase;