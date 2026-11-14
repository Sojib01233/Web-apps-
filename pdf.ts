import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ReportSections = {
  generatedAt?: string;
  sections: { heading: string; body: string[] }[];
  prospectiveConfidenceStatement?: string;
};

/** pdf-lib standard fonts use WinAnsi; map exotic glyphs to safe equivalents. */
function sanitize(text: string): string {
  return text
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[≈]/g, "~")
    .replace(/[→]/g, "->")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[α]/g, "alpha")
    .replace(/[β]/g, "beta")
    .replace(/[Δ]/g, "Delta")
    .replace(/[³]/g, "3")
    .replace(/[²]/g, "2")
    .replace(/[•]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, widthOf: (s: string) => number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function buildReportPdf(input: {
  title: string;
  subtitle: string;
  content: ReportSections;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.title} — TerraScope scientific report`);
  doc.setAuthor("TerraScope Earth Science Research Platform");
  doc.setSubject("Evidence-linked Earth science research report");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 52;
  const maxWidth = pageWidth - margin * 2;
  let page = doc.addPage([pageWidth, pageHeight]);
  let cursor = pageHeight - margin;

  const ensure = (needed: number) => {
    if (cursor - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursor = pageHeight - margin;
    }
  };

  ensure(70);
  page.drawText(sanitize(input.title).slice(0, 90), { x: margin, y: cursor, size: 18, font: bold, color: rgb(0.06, 0.09, 0.16) });
  cursor -= 24;
  wrap(sanitize(input.subtitle), (s) => regular.widthOfTextAtSize(s, 9.5), maxWidth).forEach((line) => {
    page.drawText(line, { x: margin, y: cursor, size: 9.5, font: regular, color: rgb(0.32, 0.38, 0.46) });
    cursor -= 13;
  });
  cursor -= 6;
  page.drawLine({ start: { x: margin, y: cursor }, end: { x: pageWidth - margin, y: cursor }, thickness: 1, color: rgb(0.75, 0.8, 0.85) });
  cursor -= 22;

  for (const section of input.content.sections) {
    ensure(40);
    page.drawText(sanitize(section.heading), { x: margin, y: cursor, size: 12, font: bold, color: rgb(0.05, 0.36, 0.36) });
    cursor -= 17;
    for (const paragraph of section.body) {
      const lines = wrap(sanitize(paragraph), (s) => regular.widthOfTextAtSize(s, 9.5), maxWidth);
      for (const line of lines) {
        ensure(14);
        page.drawText(line, { x: margin, y: cursor, size: 9.5, font: regular, color: rgb(0.1, 0.13, 0.18) });
        cursor -= 12.5;
      }
      cursor -= 4;
    }
    cursor -= 8;
  }

  if (input.content.prospectiveConfidenceStatement) {
    ensure(60);
    page.drawText("Confidence statement", { x: margin, y: cursor, size: 12, font: bold, color: rgb(0.05, 0.36, 0.36) });
    cursor -= 17;
    wrap(sanitize(input.content.prospectiveConfidenceStatement), (s) => regular.widthOfTextAtSize(s, 9.5), maxWidth).forEach(
      (line) => {
        ensure(14);
        page.drawText(line, { x: margin, y: cursor, size: 9.5, font: regular });
        cursor -= 12.5;
      },
    );
  }

  const footer = `Generated ${new Date().toISOString()} by TerraScope. Observations come from official provider APIs; modelled output is labelled as such.`;
  page.drawText(sanitize(footer), { x: margin, y: 30, size: 7.5, font: regular, color: rgb(0.45, 0.5, 0.58) });

  return doc.save();
}
