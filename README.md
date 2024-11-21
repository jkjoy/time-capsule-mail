# time-capsule-mail
时光邮局

## 简介
时光邮局是一个基于邮件的时光机，你可以在邮件中记录你的生活，然后在未来的某个时间点，通过邮件找回你的生活。

由`claude`开发

## 功能

- 发送邮件给未来的某个时间的某个人
- 可以选择取消
- 可以查看进度

## 使用方法

```bash
git clone https://github.com/jkjoy/time-capsule-mail.git
```

```bash
cd time-capsule-mail
```

```bash
npm install
```

```bash
node init-db.js
```

把`env.example`复制一份，命名为`.env`，然后修改里面的配置。

运行 
```bash
node app.js
```