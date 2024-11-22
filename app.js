require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const { DateTime } = require('luxon');

const app = express();
const db = new sqlite3.Database(process.env.DB_PATH || './data/future_mails.db');
const port = process.env.PORT || 3000;

// 启用 trust proxy 设置
app.set('trust proxy', true);

// 时区处理工具函数
const timeUtils = {
    toUTC: (dateStr, timezone) => DateTime.fromISO(dateStr, { zone: timezone }).toUTC().toISO(),
    toUserTimezone: (dateStr, timezone) => DateTime.fromISO(dateStr).setZone(timezone).toISO(),
    getCurrentTime: (timezone) => DateTime.now().setZone(timezone).toISO()
};

// 创建邮件传输器
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// 测试邮件配置
transporter.verify(function(error, success) {
    if (error) {
        console.log('邮件服务器配置错误:', error);
    } else {
        console.log('邮件服务器配置成功!');
    }
});

//全局配置
const mailConfig = {
    from: '"时光邮局" <' + process.env.SMTP_USER + '>',
    templates: {
        verificationCode: (verificationCode) => ({
            subject: '时光邮局 - 邮箱验证码',
            html: `
                <div style="padding: 20px; background-color: #f5f5f5;">
                    <h2 style="color: #333;">时光邮局 - 邮箱验证</h2>
                    <p>您好！</p>
                    <p>您的验证码是：<strong style="color: #4CAF50; font-size: 20px;">${verificationCode}</strong></p>
                    <p>验证码有效期为 5 分钟。如果这不是您本人的操作，请忽略此邮件。</p>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                        <p style="color: #666; font-size: 12px;">这是一封自动发送的邮件，请勿直接回复。</p>
                    </div>
                </div>
            `
        }),
        futureMail: (content, sendTime) => ({
            subject: `时光邮局 - 您的邮件已送达`,
            html: `
                <div style="padding: 20px; background-color: #f5f5f5;">
                    <h2 style="color: #333;">您有一封来自过去的信</h2>
                    <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd;">
                        <p>${content}</p>
                    </div>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                        <p style="color: #666; font-size: 12px;">这是您委托我在 ${sendTime} 发送给您,请勿直接回复。</p>
                    </div>
                </div>
            `
        })
    }
};

// 发送验证码邮件的函数
async function sendVerificationCode(toEmail, verificationCode) {
    const { subject, html } = mailConfig.templates.verificationCode(verificationCode);

    const mailOptions = {
        from: mailConfig.from,
        to: toEmail,
        subject,
        html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('验证码邮件发送成功:', info.messageId);
        return true;
    } catch (error) {
        console.error('发送验证码邮件失败:', error);
        throw error;
    }
}

// 限制请求频率
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100 // 限制每个IP 100次请求
});

app.use(express.json());
app.use(express.static('public'));
app.use(limiter);

// 生成随机字符串的函数
function generateRandomString(length) {
    return Math.random().toString(36).substring(2, length + 2);
}

// 发送邮件的函数
async function sendMail(to, subject, text) {
    const mailOptions = {
        from: process.env.SMTP_USER,
        to,
        subject,
        text
    };
    
    return transporter.sendMail(mailOptions);
}

// 创建新的时光邮件
app.post('/api/future-mail', async (req, res) => {
    const { email, content, sendTime, timezone = process.env.DEFAULT_TIMEZONE } = req.body;

    // 检查 content 是否为空
    if (!content || content.trim() === '') {
        return res.status(400).json({ error: '邮件内容不能为空' });
    }

    try {
        const securityCode = generateRandomString(8);
        const verificationCode = generateRandomString(6);
        const utcSendTime = timeUtils.toUTC(sendTime, timezone);

        db.run(
            `INSERT INTO future_mails (email, content, send_time, timezone, verification_code, security_code, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                email,
                content,
                utcSendTime,
                timezone,
                verificationCode,
                securityCode,
                DateTime.now().toUTC().toISO()
            ],
            async function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: '保存失败' });
                }

                const mailId = this.lastID;

                try {
                    await sendVerificationCode(email, verificationCode);
                    db.run(
                        `INSERT INTO mail_logs (mail_id, status, message) VALUES (?, ?, ?)`,
                        [mailId, 'VERIFICATION_SENT', '验证码已发送']
                    );
                    res.json({ mailId, securityCode });
                } catch (error) {
                    console.error('发送验证码失败:', error);
                    res.status(500).json({ error: '发送验证码失败' });
                }
            }
        );
    

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 验证邮箱
app.post('/api/verify-mail', (req, res) => {
    const { mailId, verificationCode } = req.body;

    db.get(
        'SELECT * FROM future_mails WHERE id = ? AND verification_code = ?',
        [mailId, verificationCode],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: '验证失败' });
            }

            if (!row) {
                return res.status(400).json({ error: '验证码错误' });
            }

            db.run(
                'UPDATE future_mails SET is_verified = 1 WHERE id = ?',
                [mailId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: '更新状态失败' });
                    }

                    db.run(
                        `INSERT INTO mail_logs (mail_id, status, message) VALUES (?, ?, ?)`,
                        [mailId, 'VERIFIED', '邮箱验证成功']
                    );

                    // 返回安全码
                    res.json({ success: true, securityCode: row.security_code });
                }
            );
        }
    );
});
// 取消邮件发送
app.post('/api/cancel-mail', (req, res) => {
    const { mailId, securityCode } = req.body;

    db.run(
        'UPDATE future_mails SET is_cancelled = 1 WHERE id = ? AND security_code = ?',
        [mailId, securityCode],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '取消失败' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: '未找到对应的邮件' });
            }

            // 记录取消日志
            db.run(
                `INSERT INTO mail_logs (mail_id, status, message) VALUES (?, ?, ?)`,
                [mailId, 'CANCELLED', '用户取消发送']
            );

            res.json({ success: true, message: '邮件发送已取消' });
        }
    );
});
// 查询邮件状态
app.get('/api/mail-status/:mailId/:securityCode', (req, res) => {
    const { mailId, securityCode } = req.params;

    db.get(
        'SELECT * FROM future_mails WHERE id = ? AND security_code = ?',
        [mailId, securityCode],
        (err, mail) => {
            if (err) {
                return res.status(500).json({ error: '查询失败' });
            }

            if (!mail) {
                return res.status(404).json({ error: '未找到邮件' });
            }

            db.all(
                'SELECT * FROM mail_logs WHERE mail_id = ? ORDER BY created_at DESC',
                [mailId],
                (err, logs) => {
                    if (err) {
                        return res.status(500).json({ error: '获取日志失败' });
                    }

                    res.json({ mail, logs });
                }
            );
        }
    );
});

async function checkAndSendMails() {
    try {
        const utcNow = DateTime.now().toUTC().toISO();
        const mails = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM future_mails 
                 WHERE is_verified = 1 
                 AND is_sent = 0 
                 AND send_time <= ?
                 AND retry_count < 3`,
                [utcNow],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        for (const mail of mails) {
            try {
                const localSendTime = timeUtils.toUserTimezone(mail.send_time, mail.timezone);
                const { html, subject } = mailConfig.templates.futureMail(
                    mail.content,
                    DateTime.fromISO(localSendTime).toLocaleString(DateTime.DATETIME_FULL)
                );

                await transporter.sendMail({
                    from: mailConfig.from,
                    to: mail.email,
                    subject,
                    html
                });

                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE future_mails SET is_sent = 1, sent_at = ? WHERE id = ?',
                        [DateTime.now().toUTC().toISO(), mail.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO mail_logs (mail_id, status, message) VALUES (?, ?, ?)`,
                        [mail.id, 'SENT', '邮件发送成功'],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            } catch (error) {
                console.error(`发送邮件失败 (ID: ${mail.id}):`, error);
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE future_mails SET retry_count = retry_count + 1 WHERE id = ?',
                        [mail.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO mail_logs (mail_id, status, message) VALUES (?, ?, ?)`,
                        [mail.id, 'FAILED', `发送失败: ${error.message}`],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }
    } catch (error) {
        console.error('检查邮件任务失败:', error);
    }
}

// 启动定时任务
setInterval(checkAndSendMails, 60000);

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('未捕获的错误:', err);
    res.status(500).json({
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 优化数据库连接
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('关闭数据库连接失败:', err);
        }
        process.exit(err ? 1 : 0);
    });
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});

module.exports = app;