/* ============================================================
   MarinaAI — Document Generation Tool

   Produces .docx, .xlsx, and .pdf deliverables from structured
   content. Safe: pure in-memory generation, no shell, no network
   egress, no filesystem writes. Returns base64 + filename so the
   caller can persist or download the artifact.
   ============================================================ */

const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const PptxGenJS = require("pptxgenjs");

const FORMATS = ["docx", "xlsx", "pdf", "pptx"];

/** Build a .docx buffer from a title + sections. */
async function buildDocx({ title, sections = [] }) {
  const children = [
    new Paragraph({ text: title || "Document", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "" }),
  ];
  for (const s of sections) {
    if (s.heading) {
      children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
    }
    if (s.body) {
      for (const line of String(s.body).split("\n")) {
        children.push(new Paragraph({ children: [new TextRun(line)] }));
      }
      children.push(new Paragraph({ text: "" }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** Build an .xlsx buffer from a sheet name + rows. */
async function buildXlsx({ sheetName = "Sheet1", rows = [] }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (const row of rows) {
    ws.addRow(Array.isArray(row) ? row : [row]);
  }
  return wb.xlsx.writeBuffer();
}

/** Build a .pptx buffer from a title + slides. */
function buildPptx({ title = "Presentation", slides = [] }) {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pres.layout = "WIDE";

  // Title slide
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: "0D0F12" };
  titleSlide.addText(title, { x: 0.6, y: 2.6, w: 12, h: 1.4, fontSize: 40, bold: true, color: "F8F9FA", align: "center" });

  for (const slide of slides) {
    const s = pres.addSlide();
    s.background = { color: "111318" };
    if (slide.title) {
      s.addText(slide.title, { x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 26, bold: true, color: "00F5FF" });
    }
    const bullets = (slide.bullets || []).map((b, i) => ({ text: b, bullet: true, color: i === 0 ? "F8F9FA" : "A0A4AB" }));
    s.addText(bullets, { x: 0.6, y: 1.4, w: 12, h: 5.4, fontSize: 18, valign: "top" });
  }

  return pres.write({ outputType: "base64" });
}

/** Build a .pdf buffer from a title + sections. */
function buildPdf({ title = "Document", sections = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(title);
    doc.moveDown();
    for (const s of sections) {
      if (s.heading) {
        doc.moveDown().fontSize(14).text(s.heading);
      }
      if (s.body) {
        doc.moveDown().fontSize(11).text(String(s.body));
      }
      doc.moveDown();
    }
    doc.end();
  });
}

/** Generate a deliverable in the requested format. Returns { ok, base64, filename }. */
async function generateDeliverable({ format, title, sections = [], rows = [], sheetName, slides = [] }) {
  if (!FORMATS.includes(format)) {
    return { ok: false, message: `Unsupported format: ${format}. Use docx, xlsx, pdf, or pptx.` };
  }

  let buffer;
  let filename;
  try {
    if (format === "docx") {
      buffer = await buildDocx({ title, sections });
      filename = `${slugify(title)}.docx`;
    } else if (format === "xlsx") {
      buffer = await buildXlsx({ sheetName, rows });
      filename = `${slugify(title || sheetName || "data")}.xlsx`;
    } else if (format === "pptx") {
      buffer = await buildPptx({ title, slides });
      filename = `${slugify(title)}.pptx`;
    } else {
      buffer = await buildPdf({ title, sections });
      filename = `${slugify(title)}.pdf`;
    }
  } catch (err) {
    return { ok: false, message: `Document generation failed: ${err.message}` };
  }

  return {
    ok: true,
    format,
    filename,
    sizeBytes: buffer.length,
    base64: buffer.toString("base64"),
  };
}

function slugify(s) {
  return String(s || "document")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "document";
}

module.exports = {
  FORMATS,
  buildDocx,
  buildXlsx,
  buildPdf,
  buildPptx,
  generateDeliverable,
  slugify,
};
