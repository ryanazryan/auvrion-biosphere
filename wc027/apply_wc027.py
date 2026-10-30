#!/usr/bin/env python3
"""AB-WC-027: guarded additive repair for Ranger findings/photos and Supervisor activity.

Use: python wc027/apply_wc027.py --check|--apply
Run from repo root; script never executes npm or migrates a database.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path.cwd().resolve()
PACKAGE = pathlib.Path(__file__).resolve().parent
PAYLOADS = {
    "src/app/api/ranger/tasks/[id]/findings/route.ts": "findings-route.txt",
    "src/app/api/ranger/tasks/[id]/findings/route.test.ts": "findings-route-test.txt",
    "src/app/api/ranger/tasks/[id]/findings/[findingId]/photos/route.ts": "photo-route.txt",
    "src/app/api/ranger/tasks/[id]/findings/[findingId]/photos/route.test.ts": "photo-route-test.txt",
    "src/app/api/tasks/[id]/activity/route.ts": "activity-route.txt",
    "src/components/supervisor/TaskActivityFeed.tsx": "TaskActivityFeed.txt",
}
SUPERVISOR = "src/app/supervisor/tasks/[id]/page.tsx"
GALLERY = "src/components/shared/TaskPhotoGallery.tsx"
FINDING = "src/components/ranger/RangerFindingForm.tsx"
CASE = "src/app/supervisor/decisions/[id]/page.tsx"


def substitute_one(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 matching anchor; found {count}")
    return content.replace(old, new, 1)


def patch_supervisor(original: str) -> str:
    s = substitute_one(
        original,
        'import { TaskActionPanel } from "@/components/ranger/TaskActionPanel";',
        'import { TaskActionPanel } from "@/components/ranger/TaskActionPanel";\n'
        'import { TaskActivityFeed } from "@/components/supervisor/TaskActivityFeed";',
        'Supervisor import',
    )
    s = substitute_one(s, '  Empty,\n', '', 'Supervisor unused Empty import')
    s = substitute_one(
        s, '  const { task: t, findings } = data;',
        '  const { task: t } = data;', 'Supervisor destructuring',
    )
    start = '          <Panel title={`Temuan lapangan · ${findings.length}`}>'
    end = '          <TaskPhotoGallery taskId={t.id} organizationId={a.organizationId} />'
    first = s.find(start)
    second = s.find(end)
    if first == -1 or second == -1 or second <= first or s.count(start) != 1 or s.count(end) != 1:
        raise RuntimeError('Supervisor activity panel anchors absent or ambiguous')
    s = s[:first] + (
        '          <TaskActivityFeed taskId={t.id} organizationId={a.organizationId} />\n'
    ) + s[second:]
    return s


def patch_gallery(original: str) -> str:
    old = '''    void load();
    return () => {
      alive = false;
    };
  }, [taskId, organizationId]);'''
    new = '''    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [taskId, organizationId]);'''
    return substitute_one(original, old, new, 'Gallery update interval')


def patch_finding(original: str) -> str:
    s = substitute_one(
        original,
        '''        const data: { error?: string; findingId?: string } =
          await response.json();''',
        '''        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          findingId?: string;
        };''', 'Finding response parser',
    )
    s = substitute_one(
        s,
        '''          setError(data.error ?? "Gagal menyimpan temuan.");''',
        '''          setError(
            response.status === 404
              ? "Endpoint penyimpanan temuan tidak ditemukan (HTTP 404). Periksa API Ranger pada server."
              : `Gagal menyimpan temuan (HTTP ${response.status}): ${data.error ?? "REQUEST_FAILED"}`,
          );''', 'Finding HTTP error',
    )
    s = substitute_one(
        s,
        '''        const data: { error?: string; mediaId?: string } =
          await response.json();''',
        '''        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          mediaId?: string;
        };''', 'Photo response parser',
    )
    s = substitute_one(
        s,
        '''      <PhotoFilePicker
        label="Foto bukti lapangan (opsional)"''',
        '''      <p className="text-xs leading-5 text-muted">
        Setiap temuan yang disimpan menjadi pembaruan aktivitas yang dapat
        dipantau Supervisor, tanpa menunggu pengajuan hasil akhir tugas.
        Jika sudah selesai, ajukan hasil melalui Tindakan Tugas.
      </p>
      <PhotoFilePicker
        label="Foto bukti lapangan (opsional)"''', 'Finding workflow explanation',
    )
    return s


def patch_case(original: str) -> str:
    # A small explanatory note; the live panel is on task detail, not Case.
    return substitute_one(
        original,
        '''          {tasks.length > 0 && (
            <Panel title="Tugas terkait">''',
        '''          {tasks.length > 0 && (
            <Panel title="Tugas terkait">''',
        'Case task panel guard',
    ) if False else original


def build_targets() -> dict[str, str]:
    if not (ROOT / 'package.json').exists() or not (ROOT / '.git').exists():
        raise RuntimeError('Run from the root of the Auvrion Git repository')
    target: dict[str, str] = {}
    for path, payload in PAYLOADS.items():
        data = (PACKAGE / 'payload' / payload).read_text(encoding='utf-8')
        dest = ROOT / path
        if dest.exists():
            if dest.read_text(encoding='utf-8') != data:
                raise RuntimeError(f'Found existing {path}; refusing to overwrite local implementation')
        else:
            target[path] = data
    for path, patcher in [
        (SUPERVISOR, patch_supervisor),
        (GALLERY, patch_gallery),
        (FINDING, patch_finding),
    ]:
        dest = ROOT / path
        if not dest.exists():
            raise RuntimeError(f'Missing expected project file: {path}')
        before = dest.read_text(encoding='utf-8')
        if path == SUPERVISOR and 'TaskActivityFeed taskId={t.id}' in before:
            continue  # already applied (idempotent)
        if path == GALLERY and 'window.clearInterval(timer)' in before:
            continue
        if path == FINDING and 'Setiap temuan yang disimpan menjadi' in before:
            continue
        target[path] = patcher(before)
    return target


def main() -> int:
    parser = argparse.ArgumentParser()
    choices = parser.add_mutually_exclusive_group(required=True)
    choices.add_argument('--check', action='store_true')
    choices.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        targets = build_targets()
        if args.check:
            print('WC027 PREFLIGHT PASS')
            for path in targets:
                print('  will update:', path)
            print('No files were changed.')
            return 0
        backup = ROOT / '.git' / 'wc027-ranger-progress-backup'
        for path in targets:
            dest = ROOT / path
            if dest.exists():
                saved = backup / path
                if saved.exists():
                    raise RuntimeError(f'Backup already exists; do not overwrite: {saved}')
        for path, data in targets.items():
            dest = ROOT / path
            if dest.exists():
                saved = backup / path
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dest, saved)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(data, encoding='utf-8', newline='\n')
            print('  updated:', path)
        print('WC027 APPLY PASS; run Biome, TypeScript, tests, build and manual E2E before commit.')
        return 0
    except Exception as error:
        print(f'WC027 STOPPED: {error}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
