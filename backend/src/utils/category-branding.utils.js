"use strict";


// Only allow approved, application-controlled icon identifiers.
const ICON_KEYS = Object.freeze([
  "tag", "scissors", "sparkles", "leaf", "heart", "store",
  "star", "calendar", "building", "users", "clock", "pin"
]);

const BUCKET = "bookify-category-images";
const PREFIX = "categories";

function isCategoryId(value) { return /^[1-9]\d*$/.test(String(value ?? "")); }
function isIconKey(value) { return typeof value === "string" && ICON_KEYS.includes(value); }
function isOwnedCategoryImagePath(id, path) {
  return typeof path === "string" && path.startsWith(`${PREFIX}/${id}/`) &&
    /^[a-zA-Z0-9/_\-.]+$/.test(path) && !path.includes("..");
}

module.exports = { ICON_KEYS, BUCKET, PREFIX, isCategoryId, isIconKey, isOwnedCategoryImagePath };
