module.exports = {
    server: {
        host: '0.0.0.0'
    },
    security: {
        verificationCodeExpiry: 5 * 60 * 1000, // 5分钟
        maxRetryCount: 3
    }
};