/**
 * Auvrion Biosphere transactional email.
 * Editorial layout approved 2026-10-31.
 *
 * Shared presentation for verification, activation,
 * application status, and password recovery emails.
 *
 * Dynamic content is HTML-escaped.
 * No tracking pixels or link rewriting.
 */

export type EmailAction = {
  label: string;
  url: string;
};

export type EmailTemplateInput = {
  title: string;
  greeting?: string;
  paragraphs: string[];
  action?: EmailAction;
  securityNote?: string;
  code?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const home = "https://auvrionbiosphere.com";
const wordmark =
  "https://auvrionbiosphere.com/branding/auvrion-biosphere-wordmark.png";

const heroImage =
  "https://auvrionbiosphere.com/branding/auvrion-email-hero.png";

const font = "'Montserrat', 'Avenir Next', Arial, Helvetica, sans-serif";

function toParagraph(value: string): string {
  return `
    <p
      style="
        margin:0 0 17px;
        font-family:${font};
        font-size:14px;
        line-height:1.85;
        font-weight:400;
        color:#46565b;
      "
    >
      ${escapeHtml(value)}
    </p>
  `;
}

export function renderAuvrionEmail(input: EmailTemplateInput): string {
  const safeTitle = escapeHtml(input.title);

  const [heroDescription, ...content] = input.paragraphs;

  const intro = heroDescription ?? "";

  const body = content.length > 0 ? content : intro ? [intro] : [];

  const greeting = input.greeting
    ? `
      <p
        style="
          margin:0 0 14px;
          font-family:${font};
          font-size:14px;
          font-weight:500;
          color:#1d3e35;
        "
      >
        ${escapeHtml(input.greeting)}
      </p>
    `
    : "";

  const bodyHtml = body.map(toParagraph).join("");

  const info = input.securityNote
    ? `
      <table
        role="presentation"
        width="100%"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="
          width:100%;
          margin-top:28px;
          background:#f5f8f6;
          border:1px solid #e5eeea;
          border-radius:10px;
        "
      >
        <tr>
          <td
            valign="top"
            style="padding:18px 20px;"
          >
            <p
              style="
                margin:0 0 6px;
                font-family:${font};
                font-weight:600;
                font-size:12px;
                color:#183f34;
              "
            >
              Catatan keamanan
            </p>

            <p
              style="
                margin:0;
                font-family:${font};
                font-weight:400;
                font-size:11px;
                line-height:1.75;
                color:#687971;
              "
            >
              ${escapeHtml(input.securityNote)}
            </p>
          </td>
        </tr>
      </table>
    `
    : "";

  const code = input.code
    ? `
      <table
        role="presentation"
        width="100%"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="
          width:100%;
          margin:22px 0 10px;
          border:1px solid #dcece4;
          background:#f2f9f5;
          border-radius:10px;
        "
      >
        <tr>
          <td
            align="center"
            style="
              padding:20px 12px;
              font-family:${font};
              font-weight:600;
              font-size:27px;
              letter-spacing:6px;
              color:#10563f;
            "
          >
            ${escapeHtml(input.code)}
          </td>
        </tr>
      </table>
    `
    : "";

  let button = "";

  if (input.action) {
    const parsed = new URL(input.action.url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("EMAIL_ACTION_UNSAFE_PROTOCOL");
    }

    const url = escapeHtml(parsed.toString());
    const label = escapeHtml(input.action.label);

    button = `
      <table
        role="presentation"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="margin:21px 0 0;"
      >
        <tr>
          <td
            bgcolor="#176b50"
            style="
              background:#176b50;
              border-radius:7px;
            "
          >
            <a
              href="${url}"
              style="
                display:inline-block;
                padding:14px 20px;
                color:#ffffff;
                text-decoration:none;
                font-family:${font};
                font-size:13px;
                line-height:1.3;
                font-weight:600;
              "
            >
              ${label} &nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>

      <p
        style="
          margin:12px 0 0;
          font-family:${font};
          font-size:11px;
          line-height:1.7;
          font-weight:400;
          color:#75848a;
          overflow-wrap:anywhere;
        "
      >
        Jika tombol tidak berfungsi, gunakan tautan ini:
        <br>
        <a
          href="${url}"
          style="
            color:#176b50;
            word-break:break-all;
            text-decoration:underline;
          "
        >
          ${url}
        </a>
      </p>
    `;
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">

  <title>${safeTitle} — Auvrion Biosphere</title>

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');

    @media only screen and (max-width:560px) {
      .email-sideart {
        display:none !important;
        width:0 !important;
        height:0 !important;
        overflow:hidden !important;
      }

      .email-gutter {
        padding-left:20px !important;
        padding-right:20px !important;
      }

      .email-heading {
        font-size:25px !important;
      }

      .email-wordmark {
        width:170px !important;
        max-width:170px !important;
        height:auto !important;
      }

      .email-smalltop {
        display:none !important;
      }
    }
  </style>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f5f7f6;
    font-family:${font};
  "
>
  <div
    style="
      display:none !important;
      visibility:hidden;
      opacity:0;
      color:transparent;
      height:0;
      width:0;
      overflow:hidden;
    "
  >
    ${safeTitle} — Auvrion Biosphere
  </div>

  <table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    border="0"
    width="100%"
    style="
      width:100%;
      border-collapse:collapse;
      background:#f5f7f6;
    "
  >
    <tr>
      <td align="center" style="padding:28px 12px;">

        <table
          role="presentation"
          width="640"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            max-width:640px;
            background:#ffffff;
            border:1px solid #e9eeed;
            border-radius:12px;
          "
        >

          <!-- BRAND HEADER -->
          <tr>
            <td
              class="email-gutter"
              style="padding:8px 30px 10px 30px;"
            >
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                  <td
                    align="left"
                    valign="top"
                    style="vertical-align:top;line-height:0;font-size:0;"
                  >
                    <img
                      class="email-wordmark"
                      src="${wordmark}"
                      alt="Auvrion Biosphere"
                      width="190"
                      style="
                        display:block;
                        width:190px;
                        max-width:100%;
                        height:auto;
                        border:0;
                        margin:0;
                      "
                    >
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- HERO -->
          <tr>
            <td
              class="email-gutter"
              style="padding:4px 30px 21px;"
            >
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                  <td
                    valign="middle"
                    style="padding:0 14px 0 0;"
                  >
                    <h1
                      class="email-heading"
                      style="
                        margin:0 0 14px;
                        font-family:${font};
                        font-size:31px;
                        line-height:1.25;
                        letter-spacing:-0.7px;
                        font-weight:600;
                        color:#172c34;
                      "
                    >
                      ${safeTitle}
                    </h1>

                    <p
                      style="
                        margin:0;
                        font-family:${font};
                        font-size:13px;
                        font-weight:400;
                        line-height:1.8;
                        color:#8a92a0;
                      "
                    >
                      ${escapeHtml(intro)}
                    </p>
                  </td>

                  <td
                    class="email-sideart"
                    width="172"
                    valign="middle"
                    align="center"
                    style="width:172px;"
                  >
                    <img
                      src="${heroImage}"
                      width="170"
                      height="170"
                      alt=""
                      style="
                        display:block;
                        width:170px;
                        height:170px;
                        border:0;
                      "
                    >
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td
              class="email-gutter"
              style="padding:4px 30px 0;"
            >
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                  <td
                    style="
                      border-top:1px solid #e6eaec;
                      font-size:1px;
                      line-height:1px;
                    "
                  >
                    &nbsp;
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td
              class="email-gutter"
              style="padding:27px 30px 29px;"
            >
              ${greeting}
              ${bodyHtml}
              ${code}
              ${button}
              ${info}
            </td>
          </tr>

          <!-- FOOTER DIVIDER -->
          <tr>
            <td
              class="email-gutter"
              style="padding:0 30px;"
            >
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                  <td
                    style="
                      border-top:1px solid #e6eaec;
                      font-size:1px;
                      line-height:1px;
                    "
                  >
                    &nbsp;
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              class="email-gutter"
              style="padding:21px 30px 27px;"
            >
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                  <td
                    valign="top"
                    style="
                      font-family:${font};
                      font-size:10px;
                      font-weight:400;
                      line-height:1.75;
                      color:#89939b;
                    "
                  >
                    &copy; 2026 Auvrion Biosphere.
                    <br>
                    Email transaksional.
                  </td>

                  <td
                    align="right"
                    valign="top"
                    style="
                      font-family:${font};
                      font-size:9px;
                      font-weight:500;
                      letter-spacing:1px;
                      line-height:1.75;
                      color:#89939b;
                    "
                  >
                    <a
                      href="${home}"
                      style="
                        color:#89939b;
                        text-decoration:none;
                      "
                    >
                      WEBSITE
                    </a>

                    &nbsp;&nbsp;|&nbsp;&nbsp;

                    <a
                      href="https://github.com/ryanazryan/auvrion-biosphere#documentation"
                      style="
                        color:#89939b;
                        text-decoration:none;
                      "
                    >
                      DOKUMENTASI
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
