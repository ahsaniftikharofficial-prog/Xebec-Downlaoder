// A download only counts as "done" once it's verified — not just because
// yt-dlp's process exited cleanly. Verification here means: ffprobe can
// read the file and its duration is what we expected.

const { runBinary } = require('./engine');

function buildFfprobeArgs(filePath) {
  return ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath];
}

function parseFfprobeDurationOutput(jsonText) {
  const data = JSON.parse(jsonText);
  const duration = parseFloat(data && data.format && data.format.duration);
  return Number.isFinite(duration) ? duration : null;
}

// Clips especially can be a second or two off due to keyframe alignment,
// so we allow a small tolerance rather than requiring an exact match.
function isDurationCloseEnough(actualSeconds, expectedSeconds, toleranceSeconds = 5) {
  if (actualSeconds == null || expectedSeconds == null) return false;
  return Math.abs(actualSeconds - expectedSeconds) <= toleranceSeconds;
}

async function probeDuration(ffprobePath, filePath) {
  const output = await runBinary(ffprobePath, buildFfprobeArgs(filePath));
  return parseFfprobeDurationOutput(output);
}

module.exports = {
  buildFfprobeArgs,
  parseFfprobeDurationOutput,
  isDurationCloseEnough,
  probeDuration,
};
