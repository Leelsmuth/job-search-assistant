import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { jsPDF } from "jspdf";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../src/test/fixtures");
const txtPath = join(fixturesDir, "sample-resume.txt");
const validPdfPath = join(fixturesDir, "sample-resume-text.pdf");

function main() {
  const sourceText = readFileSync(txtPath, "utf-8");
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(sourceText, 180);
  doc.text(lines, 10, 10);

  const pdfBytes = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(validPdfPath, pdfBytes);
  console.log(`Wrote ${validPdfPath} (${pdfBytes.length} bytes)`);
}

main();
