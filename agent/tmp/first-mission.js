const { askLLM, processInstruction } = require("../agent.js");

(async () => {
  try {
    const prompt = "createfile tmp/mission-brief.md";
    const instructions = await askLLM(prompt);
    console.log("INSTRUCTIONS:", JSON.stringify(instructions, null, 2));

    for (const instruction of instructions) {
      const result = await processInstruction(instruction);
      console.log("RESULT:", JSON.stringify({ instruction, result }, null, 2));
    }

    console.log("FIRST_MISSION_TASK_COMPLETE");
  } catch (error) {
    console.error("FIRST_MISSION_TASK_FAILED");
    console.error(error.stack || error.message);
    process.exit(1);
  }
})();
