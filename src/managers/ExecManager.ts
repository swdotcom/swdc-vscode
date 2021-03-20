const { spawnSync } = require("child_process");

export function execCmd(cmd = "", projectDir = null, returnLines = false) {
  let result = returnLines ? [] : null;
  if (!cmd) {
    // no command to run, return default
    return result;
  }

  const opts = projectDir ? { cwd: projectDir, encoding: "utf8" } : { encoding: "utf8" };

  try {
    const data = spawnSync("cmd", ["/c", cmd], opts);
    if (data) {
      if (data.stderr) {
        console.error("command error: ", data.stderr);
        return result;
      }

      const lines = data?.stdout?.toString().trim().replace(/^\s+/g, " ").replace(/</g, "").replace(/>/g, "").split(/\r?\n/) ?? [];
      if (lines?.length) {
        return returnLines ? lines : lines[0];
      }
    }
  } catch (e) {
    console.error("command error: ", e);
  }
  return result;
}
