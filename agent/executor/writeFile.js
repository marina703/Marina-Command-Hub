const fs = require("fs");
const path = require("path");

module.exports = function (filePath, content) {
  const dir = path.dirname(filePath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content);
  console.log("Created file:", filePath);
};
