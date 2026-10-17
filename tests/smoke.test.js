const test = require("node:test");
const assert = require("node:assert/strict");
const { slugify } = require("../lib/utils");

test("slugify creates readable URL slugs", () => {
  assert.equal(slugify("MS Word Basics!"), "ms-word-basics");
  assert.equal(slugify("  HTML & CSS  "), "html-css");
  assert.equal(slugify(""), "");
});
