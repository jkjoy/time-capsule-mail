require('dotenv').config();

module.exports = {
    server: {
        port: process.env.PORT || 3000,
        host: '0.0.0.0'
    },
    email: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    },
    security: {
        verificationCodeExpiry: 5 * 60 * 1000, // 5分钟
        maxRetryCount: 3
    }
};
