"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Item = {
  mediaId: string;
  findingId: string;
  uploadedAt: string;
  mimeType: string | null;
};

/** Server always checks access on list AND each individual image request. */
export function TaskPhotoGallery({
  taskId,
  organizationId,
}: {
  taskId: string;
  organizationId: string;
}) {
  const [photos, setPhotos] = useState<Item[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(
          `/api/tasks/${encodeURIComponent(taskId)}/photos?organizationId=${encodeURIComponent(organizationId)}`,
          {
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        if (!res.ok) throw new Error("READ_FAILED");
        const data: { photos?: Item[] } = await res.json();
        if (alive) {
          setPhotos(data.photos ?? []);
          setStatus("ready");
        }
      } catch {
        if (alive) setStatus("error");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [taskId, organizationId]);
  return (
    <section
      className="overflow-hidden rounded-lg border border-line bg-white"
      aria-labelledby="task-photo-title"
    >
      <div className="border-b border-line px-4 py-3">
        <h2 id="task-photo-title" className="text-sm font-semibold text-ink">
          Foto bukti lapangan · {photos.length}
        </h2>
      </div>
      <div className="p-4">
        {status === "loading" && (
          <p className="text-xs text-muted">Memuat foto bukti…</p>
        )}
        {status === "error" && (
          <p role="alert" className="text-xs text-danger">
            Foto belum bisa dimuat. Periksa akses dan koneksi.
          </p>
        )}
        {status === "ready" && !photos.length && (
          <p className="text-xs text-muted">Belum ada foto bukti tersimpan.</p>
        )}
        {status === "ready" && photos.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p, i) => {
              const url = `/api/tasks/${encodeURIComponent(taskId)}/photos/${encodeURIComponent(p.mediaId)}?organizationId=${encodeURIComponent(organizationId)}`;
              return (
                <li
                  key={p.mediaId}
                  className="overflow-hidden rounded-lg border border-line"
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Lihat foto bukti ${i + 1}`}
                  >
                    <Image
                      src={url}
                      alt={`Dokumentasi lapangan untuk temuan ${p.findingId.slice(0, 8)}`}
                      width={640}
                      height={360}
                      unoptimized
                      className="h-36 w-full bg-bg object-cover"
                    />
                  </a>
                  <div className="p-2 text-xs text-muted">
                    <p>Temuan #{p.findingId.slice(0, 8).toUpperCase()}</p>
                    <p>
                      {new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Makassar",
                      }).format(new Date(p.uploadedAt))}{" "}
                      WITA
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
