import "server-only";

import { and, asc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  caseObservationLinks,
  domainCases,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import {
  caseHandlingStatus,
  neutralizeSpreadsheetValue,
  witaReportRange,
} from "@/server/reports/report-utils";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

type ExportLine = {
  observationId: string;
  sourceCode: string;
  domain: string;
  ingestionMode: string;
  quality: string;
  observedAt: Date | null;
  receivedAt: Date;
  caseId: string | null;
  caseTitle: string | null;
  caseStatus: string | null;
};

function status(line: ExportLine) {
  return caseHandlingStatus(line.caseId, line.caseStatus);
}
function wita(date: Date | null) {
  return date
    ? `${new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date)} WITA`
    : "Tidak diketahui";
}
function ascii(input: string) {
  return input.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
}
function jsonError(statusCode: number, error: string) {
  return Response.json({ error }, { status: statusCode, headers });
}

export async function GET(request: Request) {
  const access = await findWorkspaceAccess("operator");
  if (!access.allowed) return jsonError(access.status, access.reason);
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some(
      (key) =>
        !["period", "year", "month", "format", "includeUncased"].includes(key),
    )
  ) {
    return jsonError(400, "INVALID_EXPORT_FILTER");
  }
  const period = params.get("period") ?? "month";
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  const format = params.get("format") ?? "xlsx";
  const includeUncased = params.get("includeUncased") === "yes";
  if (
    !["month", "year"].includes(period) ||
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    (period === "month" &&
      (!Number.isInteger(month) || month < 1 || month > 12)) ||
    !["pdf", "xlsx"].includes(format) ||
    (params.get("includeUncased") !== null &&
      !["yes", "no"].includes(params.get("includeUncased") ?? ""))
  ) {
    return jsonError(400, "INVALID_EXPORT_FILTER");
  }

  // Date interval is interpreted in WITA (UTC+08), NEVER in the app server's system timezone.
  const { start, end, label } = witaReportRange(
    year,
    period as "month" | "year",
    month,
  );

  const data = await getDb()
    .select({
      observationId: observations.id,
      sourceCode: observationSources.code,
      domain: observations.domain,
      ingestionMode: observations.ingestionMode,
      quality: observations.quality,
      observedAt: observations.observedAt,
      receivedAt: observations.receivedAt,
      caseId: domainCases.id,
      caseTitle: domainCases.title,
      caseStatus: domainCases.status,
    })
    .from(observations)
    .innerJoin(
      observationSources,
      and(
        eq(observationSources.id, observations.sourceId),
        eq(observationSources.organizationId, observations.organizationId),
      ),
    )
    .leftJoin(
      caseObservationLinks,
      and(
        eq(caseObservationLinks.observationId, observations.id),
        eq(caseObservationLinks.organizationId, observations.organizationId),
        isNull(caseObservationLinks.unlinkedAt),
      ),
    )
    .leftJoin(
      domainCases,
      and(
        eq(domainCases.id, caseObservationLinks.caseId),
        eq(domainCases.organizationId, observations.organizationId),
      ),
    )
    .where(
      and(
        eq(observations.organizationId, access.organizationId),
        gte(observations.receivedAt, start),
        lt(observations.receivedAt, end),
        ...(includeUncased ? [] : [isNotNull(domainCases.id)]),
      ),
    )
    .orderBy(asc(observations.receivedAt))
    .limit(5001);

  if (data.length > 5000)
    return jsonError(413, "EXPORT_TOO_LARGE_USE_SHORTER_PERIOD");
  const lines: ExportLine[] = data;
  const totals = new Map<string, number>();
  for (const item of lines)
    totals.set(status(item), (totals.get(status(item)) ?? 0) + 1);
  const filename = `auvrion-observasi-case-${label}.${format}`;

  if (format === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Auvrion Biosphere";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Riwayat Observasi", {
      views: [{ state: "frozen", ySplit: 4 }],
    });
    sheet.mergeCells("A1:J1");
    sheet.getCell("A1").value = "AUVRION BIOSPHERE | RIWAYAT OBSERVASI & CASE";
    sheet.getCell("A1").font = {
      bold: true,
      size: 15,
      color: { argb: "FF15563F" },
    };
    sheet.mergeCells("A2:J2");
    sheet.getCell("A2").value =
      `Periode ${label} (WITA) | ${includeUncased ? "Semua observasi" : "Hanya observasi yang dibuat Case"} | ${lines.length} baris`;
    sheet.getRow(4).values = [
      "No",
      "Observasi ID",
      "Diterima (WITA)",
      "Diamati (WITA)",
      "Domain",
      "Sumber",
      "Mode",
      "Kualitas",
      "Judul Case",
      "Status Penanganan",
    ];
    sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(4).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF177E61" },
    };
    sheet.getRow(4).height = 26;
    sheet.columns = [12, 42, 24, 24, 22, 24, 18, 20, 55, 24].map((width) => ({
      width,
    }));
    for (const [index, line] of lines.entries()) {
      const row = sheet.addRow([
        index + 1,
        line.observationId,
        wita(line.receivedAt),
        wita(line.observedAt),
        line.domain,
        neutralizeSpreadsheetValue(line.sourceCode),
        line.ingestionMode,
        line.quality,
        neutralizeSpreadsheetValue(line.caseTitle ?? "Belum dibuat Case"),
        status(line),
      ]);
      row.alignment = { vertical: "top", wrapText: true };
      if (index % 2)
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F8F5" },
        };
    }
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, lines.length + 4), column: 10 },
    };
    const summary = workbook.addWorksheet("Ringkasan");
    summary.columns = [{ width: 34 }, { width: 18 }];
    summary.addRow(["AUVRION BIOSPHERE - RINGKASAN", ""]);
    summary.addRow(["Periode WITA", label]);
    summary.addRow(["Total observasi", lines.length]);
    summary.addRow(["Kategori penanganan", "Jumlah"]);
    for (const [key, value] of totals) summary.addRow([key, value]);
    summary.getRow(1).font = { bold: true, size: 14 };
    summary.getRow(4).font = { bold: true };
    const bytes = await workbook.xlsx.writeBuffer();
    const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
    body.set(new Uint8Array(bytes));
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595]; // Landscape A4
  let page = pdf.addPage(pageSize);
  let y = 545;
  const draw = (
    text: string,
    x: number,
    fontSize = 10,
    isBold = false,
    widthLimit = 95,
  ) => {
    const s = ascii(text);
    const max = Math.max(6, Math.floor(widthLimit / (fontSize * 0.57)));
    page.drawText(s.length > max ? `${s.slice(0, max - 2)}..` : s, {
      x,
      y,
      size: fontSize,
      font: isBold ? bold : normal,
      color: rgb(0.11, 0.23, 0.19),
    });
  };
  const heading = () => {
    draw("AUVRION BIOSPHERE | RIWAYAT OBSERVASI & CASE", 36, 17, true, 750);
    y -= 24;
    draw(
      `Periode: ${label} WITA | ${includeUncased ? "Semua observasi" : "Observasi terkait Case"} | Total: ${lines.length}`,
      36,
      10,
      false,
      750,
    );
    y -= 26;
    draw("DITERIMA (WITA)", 36, 9, true, 112);
    draw("SUMBER", 155, 9, true, 130);
    draw("DOMAIN", 296, 9, true, 112);
    draw("CASE", 418, 9, true, 125);
    draw("STATUS PENANGANAN", 555, 9, true, 225);
    y -= 18;
  };
  heading();
  for (const line of lines) {
    if (y < 48) {
      page = pdf.addPage(pageSize);
      y = 545;
      heading();
    }
    draw(wita(line.receivedAt), 36, 9, false, 115);
    draw(line.sourceCode, 155, 9, false, 132);
    draw(line.domain, 296, 9, false, 115);
    draw(
      line.caseId
        ? `${line.caseId.slice(0, 8)} / ${line.caseTitle ?? ""}`
        : "-",
      418,
      9,
      false,
      125,
    );
    draw(status(line), 555, 9, false, 230);
    y -= 17;
  }
  if (lines.length === 0)
    draw(
      "Tidak ada data dalam periode dan filter yang dipilih.",
      36,
      11,
      false,
      700,
    );
  const bytes = await pdf.save();
  const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  body.set(bytes);
  return new Response(body, {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
