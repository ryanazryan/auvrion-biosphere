"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ObservationPointPicker } from "@/components/gis/ObservationPointPicker";
import { SelectMenu } from "@/components/ui/SelectMenu";
import * as I from "../../components/icons";
import { OperatorLayout } from "../../components/operator/OperatorLayout";
import {
  DomainLabel,
  ErrorState,
  KV,
  Mono,
  PageTitle,
  Panel,
  QualityBadge,
  Unknown,
} from "../../components/operator/parts";
import { Alert, Button, cx, FieldError, linkBtn } from "../../components/ui";
import {
  ApiError,
  type CreateInput,
  createObservation,
  DOMAIN,
  type Domain,
  type IngestionMode,
  KINDS,
  type MeasurementKind,
  MODE,
  sourceById,
} from "../../observations";
import { useOperator } from "../../operator-context";
import {
  type IndonesianTimeZone,
  isFutureLocalTime,
  isoToZoneLocal,
  nowInZone,
  zoneLocalToIso,
} from "../../time";

type M = {
  key: number;
  kind: "" | MeasurementKind;
  value: string;
  unit: string;
  measuredAt: string;
};
type Form = {
  domain: "" | Domain;
  sourceId: string;
  sourceRecordId: string;
  ingestionMode: IngestionMode;
  timeUnknown: boolean;
  observedAt: string;
  timeReason: string;
  locUnknown: boolean;
  latitude: string;
  longitude: string;
  locReason: string;
  attribution: string;
  licenseNote: string;
  limitations: string;
  measurements: M[];
};
const INIT: Form = {
  domain: "",
  sourceId: "",
  sourceRecordId: "",
  ingestionMode: "live",
  timeUnknown: false,
  observedAt: "",
  timeReason: "",
  locUnknown: false,
  latitude: "",
  longitude: "",
  locReason: "",
  attribution: "",
  licenseNote: "",
  limitations: "",
  measurements: [],
};
type Errs = Record<string, string>;
const num = (s: string) =>
  s.trim() === "" || !/^-?\d+(\.\d+)?$/.test(s.trim()) ? NaN : Number(s);

function validate(f: Form, zone: IndonesianTimeZone): Errs {
  const e: Errs = {};
  if (!f.domain) e.domain = "Pilih domain observasi.";
  if (!f.sourceId) e.sourceId = "Pilih sumber manual.";
  if (!f.sourceRecordId.trim()) e.sourceRecordId = "Isi ID rekaman sumber.";
  else if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(f.sourceRecordId.trim()))
    e.sourceRecordId =
      "Gunakan 1–128 karakter: diawali huruf/angka, lalu huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.";
  if (f.timeUnknown) {
    if (f.timeReason.trim().length < 10)
      e.timeReason =
        "Jelaskan mengapa waktu tidak diketahui (minimal 10 karakter).";
  } else if (!f.observedAt)
    e.observedAt = "Isi waktu observasi, atau tandai sebagai tidak diketahui.";
  else {
    try {
      if (isFutureLocalTime(f.observedAt, zone))
        e.observedAt = "Waktu observasi tidak boleh di masa depan.";
    } catch {
      e.observedAt = "Format waktu observasi tidak valid.";
    }
  }
  if (f.locUnknown) {
    if (f.locReason.trim().length < 10)
      e.locReason =
        "Jelaskan mengapa lokasi tidak diketahui (minimal 10 karakter).";
  } else {
    const la = num(f.latitude),
      lo = num(f.longitude);
    if (Number.isNaN(la))
      e.latitude = "Isi lintang dalam derajat desimal, mis. -2.2150.";
    else if (la < -90 || la > 90)
      e.latitude = "Lintang harus antara -90 dan 90.";
    if (Number.isNaN(lo))
      e.longitude = "Isi bujur dalam derajat desimal, mis. 113.9000.";
    else if (lo < -180 || lo > 180)
      e.longitude = "Bujur harus antara -180 dan 180.";
  }
  if (!f.attribution.trim())
    e.attribution = "Sebutkan siapa yang mengamati atau menyediakan data.";
  if (f.domain === "environmental_risk")
    f.measurements.forEach((m, i) => {
      if (!m.kind) e[`m${i}.kind`] = "Pilih jenis pengukuran.";
      if (Number.isNaN(num(m.value)))
        e[`m${i}.value`] =
          "Isi nilai berupa angka (pakai titik untuk desimal).";
      if (m.measuredAt) {
        try {
          if (isFutureLocalTime(m.measuredAt, zone))
            e[`m${i}.measuredAt`] = "Waktu ukur tidak boleh di masa depan.";
        } catch {
          e[`m${i}.measuredAt`] = "Format waktu ukur tidak valid.";
        }
      }
    });
  return e;
}

const toInput = (
  f: Form,
  organizationId: string,
  zone: IndonesianTimeZone,
): CreateInput => ({
  organizationId,
  sourceId: f.sourceId,
  sourceRecordId: f.sourceRecordId.trim(),
  domain: f.domain as Domain,
  ingestionMode: f.ingestionMode,
  observedAt: f.timeUnknown ? null : zoneLocalToIso(f.observedAt, zone),
  unknownObservedTimeReason: f.timeUnknown ? f.timeReason.trim() : null,
  latitude: f.locUnknown ? null : num(f.latitude),
  longitude: f.locUnknown ? null : num(f.longitude),
  locationUnknownReason: f.locUnknown ? f.locReason.trim() : null,
  provenance: {
    attribution: f.attribution.trim(),
    licenseNote: f.licenseNote.trim() || null,
    limitations: f.limitations
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  },
  measurements:
    f.domain === "environmental_risk"
      ? f.measurements.map((m) => ({
          kind: m.kind as MeasurementKind,
          measuredValue: String(num(m.value)),
          unit: m.unit,
          measuredAt: m.measuredAt ? zoneLocalToIso(m.measuredAt, zone) : null,
        }))
      : [],
});

const input = (err?: string) =>
  cx(
    "h-11 w-full rounded-md border bg-white px-3.5 text-sm text-fg placeholder:text-muted/70 transition-colors hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand",
    err
      ? "border-danger focus:ring-danger/15"
      : "border-line-strong focus:border-brand focus:ring-brand/15",
  );

function Field({
  id,
  label,
  err,
  hint,
  children,
  optional,
}: {
  id: string;
  label: string;
  err?: string;
  hint?: ReactNode;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-muted">(opsional)</span>
        )}
      </label>
      {children}
      {hint && !err && (
        <p id={`${id}-h`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {err && <FieldError id={`${id}-e`}>{err}</FieldError>}
    </div>
  );
}
const aria = (id: string, err?: string, hint?: boolean) => ({
  id,
  "aria-invalid": !!err || undefined,
  "aria-describedby": err ? `${id}-e` : hint ? `${id}-h` : undefined,
});

function Section({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-line py-6 first:pt-0 last:border-0 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
      <div>
        <p className="tnum text-xs text-muted">{String(n).padStart(2, "0")}</p>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {desc && <p className="mt-1 text-xs leading-5 text-muted">{desc}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

type Step = "edit" | "review" | "submitting" | "done";

function convertMeasurementTimeZone(
  localValue: string,
  fromZone: IndonesianTimeZone,
  toZone: IndonesianTimeZone,
): string {
  if (!localValue || fromZone === toZone) {
    return localValue;
  }

  try {
    const utc = zoneLocalToIso(localValue, fromZone);
    return isoToZoneLocal(utc, toZone);
  } catch {
    // Jangan menghilangkan input yang sedang diketik.
    return localValue;
  }
}

export function ObservationNew() {
  const { operator: OPERATOR, sources: SOURCES, timeZone } = useOperator();
  const uid = useId();
  const [f, setF] = useState<Form>(INIT);
  const previousTimeZoneRef = useRef(timeZone);

  useEffect(() => {
    const previousZone = previousTimeZoneRef.current;

    if (previousZone === timeZone) return;

    previousTimeZoneRef.current = timeZone;

    setF((current) => ({
      ...current,

      observedAt: current.timeUnknown
        ? current.observedAt
        : convertMeasurementTimeZone(
            current.observedAt,
            previousZone,
            timeZone,
          ),

      measurements: current.measurements.map((measurement) => ({
        ...measurement,
        measuredAt: convertMeasurementTimeZone(
          measurement.measuredAt,
          previousZone,
          timeZone,
        ),
      })),
    }));
  }, [timeZone]);
  // Stable for SSR and the first client render: populated only after hydration.
  const [maxLocalTime, setMaxLocalTime] = useState<string | undefined>(
    undefined,
  );
  const [errs, setErrs] = useState<Errs>({});
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState<Step>("edit");
  const [apiErr, setApiErr] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{
    id: string;
    replayed: boolean;
  } | null>(null);
  const seq = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMaxLocalTime(nowInZone(timeZone));
  }, [timeZone]);

  const upd = (p: Partial<Form>) =>
    setF((x) => {
      const n = { ...x, ...p };
      if (tried) setErrs(validate(n, timeZone));
      return n;
    });
  const updM = (i: number, p: Partial<M>) =>
    upd({
      measurements: f.measurements.map((m, j) =>
        j === i ? { ...m, ...p } : m,
      ),
    });
  useEffect(() => {
    if (step) topRef.current?.scrollIntoView?.({ block: "start" });
  }, [step]);

  const blocked = false; // Server-side route guard enforces authentication, role and MFA.
  const src = sourceById(f.sourceId, SOURCES);

  function toReview() {
    const e = validate(f, timeZone);
    setErrs(e);
    setTried(true);
    setApiErr(null);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStep("review");
  }
  async function submit() {
    // Revalidate just before submission in case time or selected zone changed on review.
    const latestErrors = validate(f, timeZone);
    if (Object.keys(latestErrors).length > 0) {
      setErrs(latestErrors);
      setTried(true);
      setStep("edit");
      return;
    }
    setStep("submitting");
    setApiErr(null);
    try {
      setResult(
        await createObservation(toInput(f, OPERATOR.organizationId, timeZone)),
      );
      setStep("done");
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(500, "unknown");
      setApiErr(err);
      if (err.status === 400 || err.status === 409 || err.status === 422) {
        setErrs({
          ...err.fields,
          ...(err.status === 422
            ? {
                sourceId:
                  "Sumber ini nonaktif dan tidak menerima rekaman baru.",
              }
            : {}),
        });
        setStep("edit");
      } else setStep("review");
    }
  }
  const restart = () => {
    setF(INIT);
    setErrs({});
    setTried(false);
    setApiErr(null);
    setResult(null);
    setStep("edit");
  };

  const errList = Object.entries(errs);
  const fid = (k: string) => `${uid}-${k}`;

  return (
    <OperatorLayout
      path="/operator/observations/new"
      crumbs={[
        { label: "Observasi", href: "/operator/observations" },
        { label: "Catat observasi" },
      ]}
    >
      <div ref={topRef} className="scroll-mt-20" />
      <PageTitle title="Catat observasi manual" />
      <ol
        aria-label="Langkah"
        className="mb-5 flex items-center gap-2 text-[13px]"
      >
        {[
          ["edit", "Isi data"],
          ["review", "Tinjau"],
          ["done", "Selesai"],
        ].map(([k, l], i) => {
          const cur = (step === "submitting" ? "review" : step) === k;
          const past =
            step === "review" || step === "submitting"
              ? i === 0
              : step === "done"
                ? i < 2
                : false;
          return (
            <li
              key={k}
              aria-current={cur ? "step" : undefined}
              className={cx(
                "flex items-center gap-2",
                cur
                  ? "font-medium text-ink"
                  : past
                    ? "text-brand"
                    : "text-muted",
              )}
            >
              {i > 0 && (
                <span aria-hidden="true" className="h-px w-6 bg-line-strong" />
              )}
              <span
                className={cx(
                  "grid size-5 place-items-center rounded-full border text-xs",
                  cur
                    ? "border-brand bg-brand text-white"
                    : past
                      ? "border-brand/50 text-brand"
                      : "border-line-strong",
                )}
              >
                {past ? <I.Check className="size-3" /> : i + 1}
              </span>
              {l}
            </li>
          );
        })}
      </ol>

      {blocked ? (
        <ErrorState error={new ApiError(403, "ROLE_OR_SCOPE_DENIED")} />
      ) : step === "done" && result ? (
        <Panel>
          <div className="py-2">
            {result.replayed ? (
              <Alert tone="info" title="Permintaan ini sudah pernah diterima">
                Server mengenali pengiriman ulang dan mengembalikan rekaman yang
                sama. Tidak ada duplikat yang dibuat.
              </Alert>
            ) : (
              <Alert tone="success" title="Observasi berhasil disimpan">
                Rekaman masuk ke antrean data dengan kualitas belum ditinjau.
              </Alert>
            )}
            <dl className="mt-4">
              <KV k="ID observasi">
                <Mono className="text-base font-medium text-ink">
                  {result.id}
                </Mono>
              </KV>
              <KV k="Domain">
                <DomainLabel d={f.domain as Domain} />
              </KV>
              <KV k="Sumber">
                <Mono>{sourceById(f.sourceId, SOURCES)?.code}</Mono> ·{" "}
                <Mono>{f.sourceRecordId}</Mono>
              </KV>
              <KV k="Kualitas">
                <QualityBadge q="unreviewed" />
              </KV>
            </dl>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={`/operator/observations/${result.id}`}
                className={`${linkBtn()} h-9 text-[13px]`}
              >
                Buka detail observasi
              </a>
              <Button
                variant="secondary"
                className="h-9 text-[13px]"
                onClick={restart}
              >
                Catat observasi lain
              </Button>
            </div>
          </div>
        </Panel>
      ) : step !== "edit" ? (
        <Review
          f={f}
          busy={step === "submitting"}
          apiErr={apiErr}
          onBack={() => setStep("edit")}
          onSubmit={submit}
        />
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            toReview();
          }}
          className="rounded-md border border-line bg-surface px-4 py-6 sm:px-6"
        >
          {apiErr && (
            <div className="mb-5">
              {apiErr.status === 409 && (
                <Alert
                  tone="warn"
                  title="ID rekaman sumber sudah dipakai (409)"
                >
                  Sumber yang sama sudah memiliki rekaman berbeda dengan ID ini.
                  Periksa catatan asli lalu gunakan ID yang benar. Data lain di
                  formulir tetap tersimpan.
                </Alert>
              )}
              {apiErr.status === 422 && (
                <Alert tone="warn" title="Sumber manual nonaktif (422)">
                  Server tidak menerima rekaman baru dari sumber ini. Pilih
                  sumber aktif atau minta administrator mengaktifkannya.
                </Alert>
              )}
              {apiErr.status === 400 && (
                <Alert tone="danger" title="Ditolak validasi server (400)">
                  Server menolak sebagian isian. Perbaiki kolom yang ditandai
                  lalu tinjau kembali.
                </Alert>
              )}
            </div>
          )}
          {errList.length > 0 && !apiErr && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              role="alert"
              className="mb-5 rounded-md border border-danger/25 bg-danger-50 px-3 py-3 text-[13px] focus:outline-none"
            >
              <p className="font-medium">
                Periksa {errList.length} isian berikut sebelum melanjutkan
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                {errList.map(([k, v]) => (
                  <li key={k}>
                    <a
                      href={`#${fid(k)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(fid(k))?.focus();
                      }}
                      className="underline underline-offset-2 hover:text-fg"
                    >
                      {v}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section n={1} title="Identitas observasi">
            <fieldset>
              <legend className="mb-1 text-[13px] font-medium">Domain</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(DOMAIN) as Domain[]).map((d, i) => (
                  <label
                    key={d}
                    className={cx(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-3 has-focus-visible:outline-2 has-focus-visible:outline-brand",
                      f.domain === d
                        ? "border-brand bg-brand-50/60"
                        : errs.domain
                          ? "border-danger"
                          : "border-line-strong hover:bg-bg",
                    )}
                  >
                    <input
                      type="radio"
                      name="domain"
                      value={d}
                      checked={f.domain === d}
                      onChange={() => upd({ domain: d })}
                      id={i === 0 ? fid("domain") : undefined}
                      aria-describedby={
                        errs.domain ? `${fid("domain")}-e` : undefined
                      }
                      className="mt-0.5 accent-brand focus:outline-none"
                    />
                    <span>
                      <DomainLabel d={d} />
                      <span className="mt-0.5 block text-xs text-muted">
                        {d === "biodiversity"
                          ? "Satwa, tumbuhan, atau aktivitas hayati yang teramati."
                          : "Kondisi lingkungan terkait risiko, mis. suhu atau kelembapan."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {errs.domain && (
                <FieldError id={`${fid("domain")}-e`}>{errs.domain}</FieldError>
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={fid("sourceId")}
                label="Sumber manual"
                err={errs.sourceId}
                hint={src && !src.active ? undefined : src?.acquisitionMethod}
              >
                <SelectMenu
                  id={fid("sourceId")}
                  label="Sumber manual"
                  value={f.sourceId}
                  onChange={(value) => upd({ sourceId: value })}
                  options={[
                    { value: "", label: "Pilih sumber…" },
                    ...SOURCES.map((source) => ({
                      value: source.id,
                      label: `${source.code} — ${source.name}${source.active ? "" : " (nonaktif)"}`,
                    })),
                  ]}
                />
                {src && !src.active && !errs.sourceId && (
                  <p className="mt-1 flex gap-1.5 text-xs text-warn">
                    <I.Alert className="mt-px size-3.5 shrink-0" />
                    Sumber ini ditandai nonaktif; server kemungkinan menolaknya.
                  </p>
                )}
              </Field>
              <Field id={fid("ingestionMode")} label="Mode ingesti">
                <SelectMenu
                  id={fid("ingestionMode")}
                  label="Mode ingesti"
                  value={f.ingestionMode}
                  onChange={(value) => upd({ ingestionMode: value })}
                  options={(Object.keys(MODE) as IngestionMode[]).map(
                    (mode) => ({
                      value: mode,
                      label: MODE[mode],
                    }),
                  )}
                />
              </Field>
            </div>
            <Field
              id={fid("sourceRecordId")}
              label="ID rekaman sumber"
              err={errs.sourceRecordId}
            >
              <input
                {...aria(fid("sourceRecordId"), errs.sourceRecordId, true)}
                value={f.sourceRecordId}
                onChange={(e) => upd({ sourceRecordId: e.target.value })}
                placeholder="PTR-1017-01"
                autoComplete="off"
                spellCheck={false}
                className={cx(input(errs.sourceRecordId), "sm:max-w-sm")}
              />
            </Field>
          </Section>

          <Section n={2} title="Waktu & lokasi">
            <p className="text-xs leading-5 text-muted">
              Tanggal dan jam ditafsirkan sebagai {timeZone}. Ubah pilihan zona
              di bagian atas sebelum mengisi waktu; data yang dikirim akan
              dikonversi ke UTC.
            </p>
            <div className="rounded-md border border-line p-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={f.timeUnknown}
                  onChange={(e) =>
                    upd({
                      timeUnknown: e.target.checked,
                      observedAt: "",
                      timeReason: "",
                    })
                  }
                  className="accent-brand"
                />
                Waktu observasi tidak diketahui
              </label>
              <div className="mt-3">
                {f.timeUnknown ? (
                  <Field
                    id={fid("timeReason")}
                    label="Alasan waktu tidak diketahui"
                    err={errs.timeReason}
                  >
                    <textarea
                      {...aria(fid("timeReason"), errs.timeReason)}
                      rows={2}
                      value={f.timeReason}
                      onChange={(e) => upd({ timeReason: e.target.value })}
                      placeholder="Mis. catatan lapangan hanya mencantumkan tanggal."
                      className={cx(
                        input(errs.timeReason),
                        "h-auto py-2 leading-5",
                      )}
                    />
                  </Field>
                ) : (
                  <Field
                    id={fid("observedAt")}
                    label={`Waktu observasi (${timeZone})`}
                    err={errs.observedAt}
                  >
                    <input
                      type="datetime-local"
                      {...aria(fid("observedAt"), errs.observedAt)}
                      value={f.observedAt}
                      max={maxLocalTime}
                      onFocus={() => setMaxLocalTime(nowInZone(timeZone))}
                      onChange={(e) => upd({ observedAt: e.target.value })}
                      className={cx(input(errs.observedAt), "sm:max-w-xs")}
                    />
                  </Field>
                )}
              </div>
            </div>
            <div className="rounded-md border border-line p-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={f.locUnknown}
                  onChange={(e) =>
                    upd({
                      locUnknown: e.target.checked,
                      latitude: "",
                      longitude: "",
                      locReason: "",
                    })
                  }
                  className="accent-brand"
                />
                Lokasi tidak diketahui
              </label>
              <div className="mt-3">
                {f.locUnknown ? (
                  <Field
                    id={fid("locReason")}
                    label="Alasan lokasi tidak diketahui"
                    err={errs.locReason}
                  >
                    <textarea
                      {...aria(fid("locReason"), errs.locReason)}
                      rows={2}
                      value={f.locReason}
                      onChange={(e) => upd({ locReason: e.target.value })}
                      placeholder="Mis. GPS kehilangan sinyal di bawah kanopi."
                      className={cx(
                        input(errs.locReason),
                        "h-auto py-2 leading-5",
                      )}
                    />
                  </Field>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id={fid("latitude")}
                        label="Lintang"
                        err={errs.latitude}
                      >
                        <input
                          {...aria(fid("latitude"), errs.latitude)}
                          inputMode="decimal"
                          value={f.latitude}
                          onChange={(e) => upd({ latitude: e.target.value })}
                          placeholder="-2.2150"
                          autoComplete="off"
                          className={cx(input(errs.latitude), "tnum")}
                        />
                      </Field>
                      <Field
                        id={fid("longitude")}
                        label="Bujur"
                        err={errs.longitude}
                      >
                        <input
                          {...aria(fid("longitude"), errs.longitude)}
                          inputMode="decimal"
                          value={f.longitude}
                          onChange={(e) => upd({ longitude: e.target.value })}
                          placeholder="113.9000"
                          autoComplete="off"
                          className={cx(input(errs.longitude), "tnum")}
                        />
                      </Field>
                    </div>
                    <ObservationPointPicker
                      latitude={f.latitude}
                      longitude={f.longitude}
                      onChange={(point) =>
                        upd({
                          latitude: String(point.latitude),
                          longitude: String(point.longitude),
                        })
                      }
                    />
                    <p className="mt-2 flex gap-1.5 text-xs text-muted">
                      <I.Lock className="mt-px size-3.5 shrink-0" />
                      Koordinat disimpan server tetapi tidak ditampilkan kembali
                      di daftar maupun detail.
                    </p>
                  </>
                )}
              </div>
            </div>
          </Section>

          <Section n={3} title="Provenans">
            <Field
              id={fid("attribution")}
              label="Atribusi"
              err={errs.attribution}
              hint="Siapa yang mengamati atau menyediakan data."
            >
              <input
                {...aria(fid("attribution"), errs.attribution, true)}
                value={f.attribution}
                onChange={(e) => upd({ attribution: e.target.value })}
                placeholder="Tim patroli Resort …"
                className={input(errs.attribution)}
              />
            </Field>
            <Field id={fid("licenseNote")} label="Catatan lisensi" optional>
              <input
                {...aria(fid("licenseNote"))}
                value={f.licenseNote}
                onChange={(e) => upd({ licenseNote: e.target.value })}
                placeholder="Mis. internal organisasi"
                className={input()}
              />
            </Field>
            <Field id={fid("limitations")} label="Keterbatasan" optional>
              <textarea
                {...aria(fid("limitations"), undefined, true)}
                rows={3}
                value={f.limitations}
                onChange={(e) => upd({ limitations: e.target.value })}
                className={cx(input(), "h-auto py-2 leading-5")}
              />
            </Field>
          </Section>

          {f.domain === "environmental_risk" ? (
            <Section n={4} title="Pengukuran lingkungan">
              {f.measurements.length === 0 && (
                <p className="text-[13px] text-muted">Belum ada pengukuran.</p>
              )}
              {f.measurements.map((m, i) => (
                <fieldset
                  key={m.key}
                  className="rounded-md border border-line p-3"
                >
                  <legend className="px-1 text-xs font-medium text-muted">
                    Pengukuran {i + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_minmax(0,1.4fr)_auto] lg:items-start">
                    <Field
                      id={fid(`m${i}.kind`)}
                      label="Jenis"
                      err={errs[`m${i}.kind`]}
                    >
                      <SelectMenu
                        id={fid(`m${i}.kind`)}
                        label="Jenis pengukuran"
                        value={m.kind}
                        onChange={(kind) =>
                          updM(i, {
                            kind,
                            unit: kind ? KINDS[kind].units[0] : "",
                          })
                        }
                        options={[
                          { value: "", label: "Pilih…" },
                          ...(Object.keys(KINDS) as MeasurementKind[]).map(
                            (kind) => ({
                              value: kind,
                              label: KINDS[kind].label,
                            }),
                          ),
                        ]}
                      />
                    </Field>
                    <Field
                      id={fid(`m${i}.value`)}
                      label="Nilai"
                      err={errs[`m${i}.value`]}
                    >
                      <input
                        {...aria(fid(`m${i}.value`), errs[`m${i}.value`])}
                        inputMode="decimal"
                        value={m.value}
                        onChange={(e) => updM(i, { value: e.target.value })}
                        className={cx(input(errs[`m${i}.value`]), "tnum")}
                      />
                    </Field>
                    <Field id={fid(`m${i}.unit`)} label="Satuan">
                      <SelectMenu
                        id={fid(`m${i}.unit`)}
                        label="Satuan"
                        value={m.unit}
                        disabled={!m.kind}
                        onChange={(unit) => updM(i, { unit })}
                        options={
                          m.kind
                            ? KINDS[m.kind].units.map((unit) => ({
                                value: unit,
                                label: unit,
                              }))
                            : [{ value: "", label: "Pilih jenis dahulu" }]
                        }
                      />
                    </Field>
                    <Field
                      id={fid(`m${i}.measuredAt`)}
                      label={`Waktu ukur (${timeZone})`}
                      optional
                      err={errs[`m${i}.measuredAt`]}
                    >
                      <input
                        type="datetime-local"
                        {...aria(
                          fid(`m${i}.measuredAt`),
                          errs[`m${i}.measuredAt`],
                        )}
                        value={m.measuredAt}
                        max={maxLocalTime}
                        onFocus={() => setMaxLocalTime(nowInZone(timeZone))}
                        onChange={(e) =>
                          updM(i, { measuredAt: e.target.value })
                        }
                        className={cx(input(errs[`m${i}.measuredAt`]), "tnum")}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() =>
                        upd({
                          measurements: f.measurements.filter(
                            (_, j) => j !== i,
                          ),
                        })
                      }
                      aria-label={`Hapus pengukuran ${i + 1}`}
                      className="inline-flex h-9 items-center gap-1.5 justify-self-start rounded-md px-2 text-[13px] text-danger hover:bg-danger-50 lg:mt-6"
                    >
                      <I.Trash className="size-4" />
                      <span className="lg:sr-only">Hapus</span>
                    </button>
                  </div>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="h-9 text-[13px]"
                onClick={() =>
                  upd({
                    measurements: [
                      ...f.measurements,
                      {
                        key: ++seq.current,
                        kind: "",
                        value: "",
                        unit: "",
                        measuredAt: "",
                      },
                    ],
                  })
                }
              >
                <I.Plus />
                Tambah pengukuran
              </Button>
            </Section>
          ) : (
            <Section n={4} title="Pengukuran lingkungan">
              <p className="text-[13px] text-muted">
                {f.domain === "biodiversity"
                  ? "Tidak berlaku untuk domain keanekaragaman hayati."
                  : "Tersedia untuk domain risiko lingkungan."}
                {f.measurements.length > 0 &&
                  f.domain === "biodiversity" &&
                  " Pengukuran yang sudah diisi tidak akan dikirim."}
              </p>
            </Section>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <a
              href="/operator/observations"
              className={`${linkBtn("secondary")} h-9 text-[13px]`}
            >
              Batal
            </a>
            <Button type="submit" className="h-9 text-[13px]">
              Tinjau sebelum kirim
              <I.ArrowRight className="size-3.5" />
            </Button>
          </div>
        </form>
      )}
    </OperatorLayout>
  );
}

function Review({
  f,
  busy,
  apiErr,
  onBack,
  onSubmit,
}: {
  f: Form;
  busy: boolean;
  apiErr: ApiError | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { sources: SOURCES, timeZone } = useOperator();
  const src = sourceById(f.sourceId, SOURCES);
  const ms = f.domain === "environmental_risk" ? f.measurements : [];
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <h2 className="text-sm font-semibold text-ink">Tinjau sebelum kirim</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Pastikan isian sesuai catatan asli. Setelah dikirim, operator tidak
          dapat mengubah rekaman.
        </p>
      </div>
      <div className="px-4 py-2 sm:px-6">
        {apiErr && (
          <div className="my-3">
            <ErrorState error={apiErr} />
          </div>
        )}
        <dl>
          <KV k="Domain">
            <DomainLabel d={f.domain as Domain} />
          </KV>
          <KV k="Sumber">
            {src && (
              <>
                <Mono>{src.code}</Mono>{" "}
                <span className="text-muted">— {src.name}</span>
              </>
            )}
          </KV>
          <KV k="ID rekaman sumber">
            <Mono>{f.sourceRecordId.trim()}</Mono>
          </KV>
          <KV k="Mode ingesti">{MODE[f.ingestionMode]}</KV>
          <KV k="Waktu observasi">
            {f.timeUnknown ? (
              <>
                <Unknown>Tidak diketahui</Unknown>
                <p className="text-[13px] text-muted">
                  Alasan: {f.timeReason.trim()}
                </p>
              </>
            ) : (
              <Mono>
                {f.observedAt.replace("T", " ")} {timeZone}
              </Mono>
            )}
          </KV>
          <KV k="Lokasi">
            {f.locUnknown ? (
              <>
                <Unknown>Tidak diketahui</Unknown>
                <p className="text-[13px] text-muted">
                  Alasan: {f.locReason.trim()}
                </p>
              </>
            ) : (
              <>
                <Mono>
                  {f.latitude.trim()}, {f.longitude.trim()}
                </Mono>
                <p className="text-xs text-muted">
                  Disimpan; tidak akan ditampilkan kembali setelah dikirim.
                </p>
              </>
            )}
          </KV>
          <KV k="Atribusi">{f.attribution.trim()}</KV>
          <KV k="Catatan lisensi">
            {f.licenseNote.trim() || <Unknown>Tidak diisi</Unknown>}
          </KV>
          <KV k="Keterbatasan">
            {f.limitations.trim() ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {f.limitations
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => (
                    <li key={l}>{l}</li>
                  ))}
              </ul>
            ) : (
              <Unknown>Tidak diisi</Unknown>
            )}
          </KV>
          {f.domain === "environmental_risk" && (
            <KV k="Pengukuran">
              {ms.length === 0 ? (
                <Unknown>Tidak ada</Unknown>
              ) : (
                <ul className="space-y-0.5">
                  {ms.map((m) => (
                    <li key={m.key}>
                      {KINDS[m.kind as MeasurementKind].label}:{" "}
                      <Mono>
                        {m.value.trim()} {m.unit}
                      </Mono>
                      {m.measuredAt && (
                        <span className="text-muted">
                          {" "}
                          ·{" "}
                          <Mono>
                            {m.measuredAt.replace("T", " ")} {timeZone}
                          </Mono>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </KV>
          )}
          <KV k="Kualitas awal">
            <QualityBadge q="unreviewed" />
            <span className="ml-2 text-xs text-muted">Ditetapkan server</span>
          </KV>
        </dl>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button
          variant="secondary"
          className="h-9 text-[13px]"
          onClick={onBack}
          disabled={busy}
        >
          <I.ArrowLeft className="size-3.5" />
          Ubah isian
        </Button>
        <Button className="h-9 text-[13px]" onClick={onSubmit} loading={busy}>
          {busy ? "Mengirim…" : apiErr ? "Coba kirim lagi" : "Kirim observasi"}
        </Button>
      </div>
    </div>
  );
}
