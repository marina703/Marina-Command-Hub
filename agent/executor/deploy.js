const runCommand = require("./runCommand");

module.exports = function(target) {
  return runCommand(`vercel deploy --prod ${target}`);
};
