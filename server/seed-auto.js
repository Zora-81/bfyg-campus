// 自动种子 — 首次运行时创建默认数据
const bcrypt = require('bcryptjs');

module.exports = function autoSeed(db) {
  db.exec('PRAGMA foreign_keys=OFF');

  // 创建 admin 账号
  const hash = bcrypt.hashSync('admin123', 12);
  db.run(
    'INSERT INTO users (username, password_hash, nickname, role) VALUES (?,?,?,?)',
    ['admin', hash, '管理员', 'admin']
  );
  db.run(
    'INSERT INTO users (username, password_hash, nickname, role) VALUES (?,?,?,?)',
    ['moderator', bcrypt.hashSync('mod123', 12), '版主小王', 'moderator']
  );

  // 演示学生
  const students = [
    ['zhangsan', '张三'],
    ['lisi', '李四'],
    ['wangwu', '王五'],
    ['xiaoming', '小明'],
    ['xiaohong', '小红'],
  ];
  students.forEach(([uname, nick]) => {
    db.run(
      'INSERT INTO users (username, password_hash, nickname, role) VALUES (?,?,?,?)',
      [uname, bcrypt.hashSync('123456', 12), nick, 'student']
    );
  });

  // 默认频道
  const channels = [
    ['general', '全频道大厅', 'public'],
    ['study', '学习交流', 'public'],
    ['life', '校园生活', 'public'],
    ['notice', '公告栏', 'announcement'],
    ['luntan', '论坛广场', 'public'],
    ['bangbang', '帮帮墙', 'public'],
  ];
  channels.forEach(([name, desc, type]) => {
    db.run(
      'INSERT INTO channels (name, description, type, created_by) VALUES (?,?,?,?)',
      [name, desc, type, 1]
    );
  });

  // 所有用户加入所有频道
  const userIds = db.all('SELECT id FROM users');
  const channelIds = db.all('SELECT id FROM channels');
  userIds.forEach(u => {
    channelIds.forEach(c => {
      db.run(
        'INSERT OR IGNORE INTO channel_members (user_id, channel_id) VALUES (?,?)',
        [u.id, c.id]
      );
    });
  });

  // 示例消息
  const demoMsgs = [
    [1, userIds[0].id, '欢迎来到宝丰一高校园频道！'],
    [4, userIds[0].id, '【公告】请大家遵守校园频道规则，文明发言。'],
    [1, userIds[1].id, '大家好，我是版主小王，有什么问题可以找我'],
    [2, userIds[2].id, '有人有今天的数学作业答案吗？'],
    [2, userIds[3].id, '别抄作业，自己先做！不会的可以来问我'],
    [3, userIds[4].id, '食堂今天的红烧肉还不错'],
    [3, userIds[5].id, '真的吗！我明天去试试'],
    [1, userIds[6].id, '晚上有人打球吗？操场集合'],
    [5, userIds[2].id, '想讨论一下周末的活动安排'],
  ];
  demoMsgs.forEach(([chId, authorId, content]) => {
    db.run(
      'INSERT INTO messages (channel_id, author_id, content) VALUES (?,?,?)',
      [chId, authorId, content]
    );
  });

  db.saveDatabase();
  console.log('[seed] 种子数据写入完成 (7 用户 + 6 频道 + 8 消息)');
};
