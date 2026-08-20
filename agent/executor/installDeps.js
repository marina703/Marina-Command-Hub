const runCommand = require("./runCommand");

module.exports = function(pm, pkgs) {
  return runCommand(`${pm} install ${pkgs.join(" ")}`);
};
