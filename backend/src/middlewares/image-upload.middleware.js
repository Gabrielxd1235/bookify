const multer = require("multer");
const { MAX_IMAGE_SIZE } = require("../utils/image-storage.utils");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 8 },
  fileFilter(req, file, cb) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      const error = new Error("Only JPEG, PNG and WebP images are allowed");
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  }
}).single("image");

function imageUpload(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? "Image exceeds the 5 MB limit" : (error.message || "Invalid upload")
    });
  });
}

module.exports = { imageUpload };
