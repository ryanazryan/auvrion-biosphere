import { describe, expect, it } from "vitest";
import { renderAuvrionEmail } from "./template";

describe("Auvrion branded email", () => {
  it("preserves the approved editorial layout without production mail test tag", () => {
    const html = renderAuvrionEmail({
      title: "Verifikasi Email",
      paragraphs: ["Anda menerima email verifikasi.", "Lanjutkan proses."],
      action: {
        label: "Verifikasi",
        url: "https://auvrionbiosphere.com/request-access/verify#token=abc",
      },
      securityNote: "Tautan berlaku 30 menit.",
    });
    expect(html).toContain(
      "https://auvrionbiosphere.com/branding/auvrion-biosphere-wordmark.png",
    );

    expect(html).toContain(
      "https://auvrionbiosphere.com/branding/auvrion-email-hero.png",
    );

    expect(html).not.toContain("cid:auvrion-logo");
    expect(html).not.toContain("cid:auvrion-hero");
    expect(html).toContain("Montserrat");
    expect(html).not.toContain("TRANSACTIONAL EMAIL");
    expect(html).not.toContain("PRODUCTION MAIL TEST");
    expect(html).toContain("#token=abc");
    expect(html).toContain("Verifikasi");
  });

  it("escapes content and HTML attributes", () => {
    const html = renderAuvrionEmail({
      title: `<script>alert("x")</script>`,
      paragraphs: [`<img src=x onerror=alert(1)>`, "Informasi aman."],
      securityNote: `Jangan kirim <token> & "rahasia".`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;token&gt;");
  });

  it("denies non-http link schemes", () => {
    expect(() =>
      renderAuvrionEmail({
        title: "X",
        paragraphs: ["Halo"],
        action: { label: "Klik", url: "javascript:alert(1)" },
      }),
    ).toThrow("EMAIL_ACTION_UNSAFE_PROTOCOL");
  });

  it("renders numeric codes as text", () => {
    const html = renderAuvrionEmail({
      title: "Reset",
      paragraphs: ["Kode reset", "Masukkan kode di form."],
      code: "12345678",
    });
    expect(html).toContain("12345678");
  });
});
