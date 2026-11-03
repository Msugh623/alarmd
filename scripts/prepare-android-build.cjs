const fs = require("node:fs");
const path = require("node:path");

const reactNativeDir = process.env.ALARM_BUILD_REACT_NATIVE_DIR;
const codegenDir = process.env.ALARM_BUILD_CODEGEN_DIR;

if (!reactNativeDir || !fs.existsSync(reactNativeDir)) {
  throw new Error("React Native package directory is missing.");
}

if (!codegenDir || !fs.existsSync(codegenDir)) {
  throw new Error("React Native codegen package directory is missing.");
}

const gradleFile = path.join(process.cwd(), "android", "app", "build.gradle");
let gradle = fs.readFileSync(gradleFile, "utf8");

function replaceRequired(pattern, replacement, description) {
  if (!pattern.test(gradle)) {
    throw new Error(`Could not find ${description} in android/app/build.gradle.`);
  }
  gradle = gradle.replace(pattern, replacement);
}

replaceRequired(
  /^([ \t]*)reactNativeDir = .*$/m,
  (_, indentation) =>
    `${indentation}reactNativeDir = new File(System.getenv('ALARM_BUILD_REACT_NATIVE_DIR'))`,
  "React Native directory setting",
);
replaceRequired(
  /^([ \t]*)codegenDir = .*$/m,
  (_, indentation) =>
    `${indentation}codegenDir = new File(System.getenv('ALARM_BUILD_CODEGEN_DIR'))`,
  "React Native codegen directory setting",
);

if (/arguments "-DCMAKE_OBJECT_PATH_MAX=\d+"/.test(gradle)) {
  gradle = gradle.replace(
    /arguments "-DCMAKE_OBJECT_PATH_MAX=\d+"/,
    'arguments "-DCMAKE_OBJECT_PATH_MAX=120"',
  );
} else {
  replaceRequired(
    /^([ \t]*)defaultConfig\s*\{/m,
    (_, indentation) =>
      `${indentation}defaultConfig {\n` +
      `${indentation}    externalNativeBuild {\n` +
      `${indentation}        cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=120" }\n` +
      `${indentation}    }`,
    "defaultConfig block",
  );
}

fs.writeFileSync(gradleFile, gradle);
