import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [relativeOutputPath, expectedBytesText] = process.argv.slice(2);
const expectedBytes = Number(expectedBytesText);
const projectRoot = path.resolve(process.cwd());
const outputPath = path.resolve(projectRoot, relativeOutputPath ?? "");

if (
  !relativeOutputPath ||
  !Number.isSafeInteger(expectedBytes) ||
  expectedBytes <= 0 ||
  (outputPath !== projectRoot && !outputPath.startsWith(`${projectRoot}${path.sep}`))
) {
  throw new Error("Invalid receiver target or expected byte count.");
}

let base64Input = "";
const expectedBase64Characters = Math.ceil(expectedBytes / 3) * 4;
let committed = false;

async function commit() {
  const bytes = Buffer.from(base64Input, "base64");
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Decoded ${bytes.byteLength} bytes; expected ${expectedBytes}.`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes, { flag: "wx" });
  const digest = createHash("sha256").update(bytes).digest("hex");
  committed = true;
  process.stdout.write(`FILE_RECEIVER_COMMITTED ${bytes.byteLength} ${digest}\n`);
  process.exit(0);
}

process.stdin.setEncoding("utf8");
if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
  process.stdin.setRawMode(true);
}
process.stdin.on("data", (chunk) => {
  base64Input += chunk.replace(/\s/g, "");
  if (base64Input.length > expectedBase64Characters) {
    process.stderr.write(`Received ${base64Input.length} base64 characters; expected ${expectedBase64Characters}.\n`);
    process.exit(1);
  }
  if (base64Input.length === expectedBase64Characters) commit().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
});

process.stdin.on("end", () => {
  if (!committed) {
    process.stderr.write("Receiver closed before commit.\n");
    process.exit(1);
  }
});

process.stdout.write("FILE_RECEIVER_READY\n");
