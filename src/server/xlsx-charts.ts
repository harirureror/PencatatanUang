// Pelengkap exceljs (yang tidak bisa membuat grafik / tautan antar-sheet yang rapi): menyunting
// isi paket .xlsx hasil exceljs langsung — menambah grafik batang asli Excel dan hyperlink internal.
// Bekerja pada Map<path, isi> dari readZip; tulis ulang dengan createZip.

export type XlsxFiles = Map<string, Buffer>;

const xml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const text = (files: XlsxFiles, path: string) => {
  const buf = files.get(path);
  if (!buf) throw new Error(`Bagian ${path} tidak ada di file xlsx.`);
  return buf.toString("utf8");
};

/** Path file XML sheet berdasarkan namanya (mis. "Dashboard" → "xl/worksheets/sheet2.xml"). */
export function sheetPath(files: XlsxFiles, name: string): string {
  const wb = text(files, "xl/workbook.xml");
  const sheet = new RegExp(`<sheet [^>]*name="${xml(name)}"[^>]*/>`).exec(wb)?.[0];
  const rid = sheet && /r:id="([^"]+)"/.exec(sheet)?.[1];
  const rels = text(files, "xl/_rels/workbook.xml.rels");
  const target = rid && new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*/>`).exec(rels)?.[0];
  const path = target && /Target="([^"]+)"/.exec(target)?.[1];
  if (!path) throw new Error(`Sheet ${name} tidak ditemukan.`);
  return path.startsWith("/") ? path.slice(1) : `xl/${path}`;
}

/** Sisipkan elemen ke worksheet tepat sebelum elemen pertama yang harus berada sesudahnya. */
function insertBefore(sheet: string, block: string, followers: string[]): string {
  const at = followers
    .map((tag) => sheet.indexOf(tag))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  return sheet.slice(0, at) + block + sheet.slice(at);
}

// Urutan elemen worksheet (ECMA-376 §18.3.1.99).
const AFTER_HYPERLINKS = ["<printOptions", "<pageMargins", "<pageSetup", "<headerFooter", "<rowBreaks", "<colBreaks", "<drawing", "<legacyDrawing", "<tableParts", "<extLst", "</worksheet>"];
const AFTER_DRAWING = ["<legacyDrawing", "<legacyDrawingHF", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>"];

export type InternalLink = { ref: string; location: string; display: string };

/**
 * exceljs menulis tautan antar-sheet sebagai relasi eksternal "#Sheet!A1" yang tidak selalu
 * bisa diklik (mis. di Google Sheets). Tulis sebagai `<hyperlink location=…>` biasa — persis
 * seperti file buatan Excel / Google Sheets. Sel tujuan cukup berisi teks biasa.
 */
export function addInternalLinks(files: XlsxFiles, path: string, links: InternalLink[]): void {
  if (links.length === 0) return;
  const sheet = text(files, path);
  if (sheet.includes("<hyperlinks>")) throw new Error(`Sheet ${path} sudah punya hyperlink.`);
  const block = `<hyperlinks>${links
    .map((l) => `<hyperlink ref="${l.ref}" location="${xml(l.location)}" display="${xml(l.display)}"/>`)
    .join("")}</hyperlinks>`;
  files.set(path, Buffer.from(insertBefore(sheet, block, AFTER_HYPERLINKS)));
}

export type BarChart = {
  /** "bar" = batang mendatar (kategori), "col" = kolom tegak (harian). */
  direction: "bar" | "col";
  title: string;
  seriesName: string;
  /** Rentang absolut termasuk nama sheet, mis. "'Dashboard'!$A$10:$A$15". */
  categoriesRef: string;
  valuesRef: string;
  /** Cache nilai (ditampilkan sebelum Excel menghitung ulang). Tanggal = nomor seri Excel. */
  categories: { kind: "text"; values: string[] } | { kind: "date"; values: number[]; format: string };
  values: number[];
  color: string; // RRGGBB
  /** Format angka sumbu nilai. */
  valueFormat: string;
  /** Format label data (mis. tanpa angka nol). Bawaan: valueFormat. */
  labelFormat?: string;
  /** Tampilkan nilai di ujung batang (cocok untuk sedikit batang). */
  dataLabels: boolean;
  /** Posisi: kolom/baris 0-based, `to` eksklusif. */
  from: { col: number; row: number };
  to: { col: number; row: number };
};

const TEXT_GRAY = "595959";
const GRID_GRAY = "E5E7EB";

const txPr = (size: number) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}"><a:solidFill><a:srgbClr val="${TEXT_GRAY}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="id-ID"/></a:p></c:txPr>`;

function chartXml(c: BarChart): string {
  const n = c.values.length;
  const cat =
    c.categories.kind === "text"
      ? `<c:strRef><c:f>${xml(c.categoriesRef)}</c:f><c:strCache><c:ptCount val="${n}"/>${c.categories.values
          .map((v, i) => `<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`)
          .join("")}</c:strCache></c:strRef>`
      : `<c:numRef><c:f>${xml(c.categoriesRef)}</c:f><c:numCache><c:formatCode>${xml(c.categories.format)}</c:formatCode><c:ptCount val="${n}"/>${c.categories.values
          .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
          .join("")}</c:numCache></c:numRef>`;
  const val = `<c:numRef><c:f>${xml(c.valuesRef)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${c.values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("")}</c:numCache></c:numRef>`;
  const labels = c.dataLabels
    ? `<c:dLbls><c:numFmt formatCode="${xml(c.labelFormat ?? c.valueFormat)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
    : "";
  const horizontal = c.direction === "bar";
  // Batang mendatar: kategori pertama (terbesar) di atas → sumbu kategori dibalik, sumbu nilai
  // dipindah ke bawah dengan crosses="max".
  const catAx = `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="${horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/><c:numFmt formatCode="${xml(c.categories.kind === "date" ? c.categories.format : "General")}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr>${txPr(800)}<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valAx = `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "b" : "l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${GRID_GRAY}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xml(c.valueFormat)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800)}<c:crossAx val="1001"/><c:crosses val="${horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="id-ID"/><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="id-ID" sz="1200" b="1"/><a:t>${xml(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="${c.direction}"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xml(c.seriesName)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${c.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>${labels}<c:cat>${cat}</c:cat><c:val>${val}</c:val></c:ser><c:gapWidth val="${horizontal ? 60 : 40}"/><c:axId val="1001"/><c:axId val="1002"/></c:barChart>${catAx}${valAx}<c:spPr><a:noFill/></c:spPr></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
}

const nextIndex = (files: XlsxFiles, re: RegExp) =>
  1 + Math.max(0, ...[...files.keys()].map((p) => Number(re.exec(p)?.[1] ?? 0)));

function addOverride(files: XlsxFiles, partName: string, contentType: string) {
  const ct = text(files, "[Content_Types].xml");
  if (ct.includes(`PartName="${partName}"`)) return;
  files.set(
    "[Content_Types].xml",
    Buffer.from(ct.replace("</Types>", `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`)),
  );
}

/** Tambahkan grafik ke sheet (sheet tersebut belum boleh punya gambar / drawing dari exceljs). */
export function addCharts(files: XlsxFiles, path: string, charts: BarChart[]): void {
  if (charts.length === 0) return;
  let sheet = text(files, path);
  if (sheet.includes("<drawing ")) throw new Error(`Sheet ${path} sudah punya drawing.`);

  const drawingNo = nextIndex(files, /^xl\/drawings\/drawing(\d+)\.xml$/);
  let chartNo = nextIndex(files, /^xl\/charts\/chart(\d+)\.xml$/);
  const anchors: string[] = [];
  const drawingRels: string[] = [];
  charts.forEach((c, i) => {
    const part = `chart${chartNo++}.xml`;
    files.set(`xl/charts/${part}`, Buffer.from(chartXml(c)));
    addOverride(files, `/xl/charts/${part}`, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml");
    drawingRels.push(
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${part}"/>`,
    );
    anchors.push(
      `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c.from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${xml(c.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    );
  });

  const drawing = `xl/drawings/drawing${drawingNo}.xml`;
  files.set(
    drawing,
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`,
    ),
  );
  files.set(
    `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>`,
    ),
  );
  addOverride(files, `/${drawing}`, "application/vnd.openxmlformats-officedocument.drawing+xml");

  // Relasi sheet → drawing.
  const relsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
  const relId = "rIdCharts1";
  const rel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/>`;
  const rels = files.get(relsPath)?.toString("utf8");
  files.set(
    relsPath,
    Buffer.from(
      rels
        ? rels.replace("</Relationships>", `${rel}</Relationships>`)
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`,
    ),
  );

  if (!/<worksheet[^>]*xmlns:r=/.test(sheet)) {
    sheet = sheet.replace(
      "<worksheet ",
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
    );
  }
  files.set(path, Buffer.from(insertBefore(sheet, `<drawing r:id="${relId}"/>`, AFTER_DRAWING)));
}
