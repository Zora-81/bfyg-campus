// 文件上传路由
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 上传目录
const UPLOADS_DIR = process.env.PERSIST_DIR
  ? path.join(process.env.PERSIST_DIR, 'uploads')
  : path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer 配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // 格式: {timestamp}-{random}-{originalname}
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const safeName = rand + ext;
    cb(null, ts + '-' + safeName);
  }
});

const fileFilter = function (req, file, cb) {
  const allowedImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedFiles = [...allowedImages, 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

  if (allowedFiles.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 上传端点
router.post('/', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }

  const isImage = req.file.mimetype.startsWith('image/');
  const url = '/uploads/' + req.file.filename;

  res.json({
    success: true,
    url: url,
    filename: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
    isImage: isImage
  });
});

module.exports = router;
