const crypto = require("node:crypto");
const supabase = require("../config/supabase");
const { publicImageUrl } = require("./extension.utils");

const AVATAR_BUCKET = "bookify-avatars";
const BUSINESS_BUCKET = "bookify-business-media";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function inspectImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size === 0) {
    return { error: "An image file is required" };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: "Images must be 5 MB or smaller" };
  }
  const b = file.buffer;
  let type = null;
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    type = { ext: "jpg", mime: "image/jpeg" };
  } else if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    type = { ext: "png", mime: "image/png" };
  } else if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    type = { ext: "webp", mime: "image/webp" };
  }
  if (!type || file.mimetype !== type.mime) {
    return { error: "Only valid JPEG, PNG or WebP images are allowed" };
  }
  return { type };
}

async function uploadFile(bucket, prefix, file) {
  const inspected = inspectImage(file);
  if (inspected.error) return { error: inspected.error };
  const path = `${prefix}/${crypto.randomUUID()}.${inspected.type.ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: inspected.type.mime,
    cacheControl: "3600",
    upsert: false
  });
  if (error) return { storageError: error };
  return { path, url: publicImageUrl(bucket, path) };
}

async function removeFile(bucket, path) {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error("BOOKIFY image cleanup error:", error.message);
}

module.exports = {
  AVATAR_BUCKET, BUSINESS_BUCKET, MAX_IMAGE_SIZE,
  inspectImage, uploadFile, removeFile
};
