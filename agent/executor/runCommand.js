const { exec } = require("child_process");

module.exports = function(command) {
  return new Promise(resolve => {
    exec(command, (err, stdout, stderr) => {
      if (err) console.error("Error:", err);
      console.log(stdout || stderr);
      resolve();
    });
  });
};
