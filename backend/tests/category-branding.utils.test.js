"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ICON_KEYS, isIconKey, isOwnedCategoryImagePath } = require("../src/utils/category-branding.utils");
test("only known icons are accepted", () => {
  for (const key of ICON_KEYS) assert.equal(isIconKey(key), true);
  for (const key of ["<script>", "bad/path", "", null, "ADMIN"]) assert.equal(isIconKey(key), false);
});
test("image cleanup is restricted to the category prefix", () => {
  assert.equal(isOwnedCategoryImagePath(12, "categories/12/example.jpg"), true);
  assert.equal(isOwnedCategoryImagePath(12, "categories/13/example.jpg"), false);
  assert.equal(isOwnedCategoryImagePath(12, "../categories/12/example.jpg"), false);
  assert.equal(isOwnedCategoryImagePath(12, "categories/12/../../other.jpg"), false);
});
