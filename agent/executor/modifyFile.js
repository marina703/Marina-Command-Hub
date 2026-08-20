const fs = require("fs");
const path = require("path");

module.exports = function (filePath, changes) {
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }

  let file = fs.readFileSync(filePath, "utf8");
  const appendValue = changes || "";
  const startsWithNewline = /^\r?\n/.test(appendValue);

  if (
    file &&
    file.length > 0 &&
    !file.endsWith("\n") &&
    appendValue.length > 0 &&
    !startsWithNewline
  ) {
    file += "\n";
  }

  file += appendValue;
  fs.writeFileSync(filePath, file);
  console.log("Modified file:", filePath);
};
