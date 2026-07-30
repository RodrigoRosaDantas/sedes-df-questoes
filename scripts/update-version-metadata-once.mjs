import fs from "node:fs";

function replace(path, pairs) {
  let content = fs.readFileSync(path, "utf8");
  for (const [before, after] of pairs) {
    if (!content.includes(before)) throw new Error(`${path}: marcador ausente: ${before}`);
    content = content.replaceAll(before, after);
  }
  fs.writeFileSync(path, content);
}

replace("assets/reports-v2-10.js", [
  ['app_version: "2.10.1"', 'app_version: "2.11.1"'],
]);
replace("tests/reports-v2-10.spec.js", [
  ['expect(backup.app_version).toBe("2.10.1");', 'expect(backup.app_version).toBe("2.11.1");'],
  ['expect(build.version).toBe("2.11.0");', 'expect(build.version).toBe("2.11.1");'],
  ['expect(build.builder).toBe("build-public-v2-11");', 'expect(build.builder).toBe("copy-public-v2-11-1");'],
]);
console.log("✓ Metadados e testes alinhados à versão 2.11.1.");
