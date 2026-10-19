/** Shared UI/server validation for the first (local-only) onboarding step. */
export type AccessRequestFields = {
  name: string;
  email: string;
};

export type AccessRequestErrors = Partial<
  Record<keyof AccessRequestFields, string>
>;

export type AccessRequestValidation =
  | { ok: true; value: AccessRequestFields }
  | { ok: false; errors: AccessRequestErrors };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAccessRequest(input: unknown): AccessRequestValidation {
  const data =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const name =
    typeof data.name === "string" ? data.name.trim().replace(/\s+/g, " ") : "";
  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";

  const errors: AccessRequestErrors = {};

  if (!name) {
    errors.name = "Nama lengkap wajib diisi.";
  } else if (name.length < 3) {
    errors.name = "Nama lengkap minimal 3 karakter.";
  } else if (name.length > 100) {
    errors.name = "Nama lengkap maksimal 100 karakter.";
  }

  if (!email) {
    errors.email = "Email wajib diisi.";
  } else if (email.length > 254 || !EMAIL.test(email)) {
    errors.email =
      "Masukkan alamat email yang valid, misalnya nama@instansi.go.id.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: { name, email } };
}
