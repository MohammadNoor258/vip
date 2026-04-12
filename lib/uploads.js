const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOADS_MENU_DIR, UPLOADS_LOGO_DIR } = require('./paths');

const menuDir = UPLOADS_MENU_DIR;
const logoDir = UPLOADS_LOGO_DIR;

function ensureUploadDirs() {
  fs.mkdirSync(menuDir, { recursive: true });
  fs.mkdirSync(logoDir, { recursive: true });
}

function imageFileFilter(req, file, cb) {
  if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('invalid_image_type'));
  }
}

const menuStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, menuDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  },
});

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `logo-${Date.now()}${ext}`);
  },
});

const uploadMenuImage = multer({
  storage: menuStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 4 * 1024 * 1024 },
});

const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = {
  ensureUploadDirs,
  uploadMenuImage,
  uploadLogo,
  menuDir,
  logoDir,
};
