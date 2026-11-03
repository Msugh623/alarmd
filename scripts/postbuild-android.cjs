const fs = require("node:fs");
const path = require("node:path");

const projectDir = path.resolve(__dirname, "..");
const apkPath = path.join(
  projectDir,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
const outputDir = path.join(projectDir, "build");
const outputPath = path.join(outputDir, "app-release.apk");

if (!fs.existsSync(apkPath)) {
  console.error(`Android release APK not found: ${apkPath}`);
  process.exitCode = 1;
} else {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(apkPath, outputPath);
  fs.unlinkSync(apkPath);
  console.log(`Moved Android release APK to ${outputPath}`);
}
