const { askLLM, processInstruction } = require("../agent.js");

(async () => {
  try {
    const instructions = await askLLM("createfile tmp/mission-brief.md");
    console.log("RAW_INSTRUCTIONS", JSON.stringify(instructions, null, 2));

    for (const instruction of instructions) {
      const result = await processInstruction(instruction);
      console.log("EXECUTED", JSON.stringify({ instruction, result }, null, 2));
    }

    console.log("FIRST_TASK_COMPLETE");
  } catch (error) {
    console.error("FIRST_TASK_FAILED");
    console.error(error.stack || error.message);
    process.exit(1);
  }
})();
