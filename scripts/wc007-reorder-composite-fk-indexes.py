"""For generated 0012: move ONLY qualifying UNIQUE INDEX definitions before FK statements.

The new schema uses inline UNIQUE constraints for referenced keys, so this
usually prints 'no move needed'. It never runs SQL or touches a database.
Any remaining CREATE UNIQUE INDEX in this script is examined manually.
"""
from pathlib import Path
import sys

path = Path("drizzle/0012_wc007_operations_domain.sql")
if not path.exists():
    sys.exit("ERROR: 0012 migration not found; read actual generated filename and verify before proceeding")
sql = path.read_text(encoding="utf-8")

if any(token in sql.upper() for token in ("DROP TABLE", "DROP COLUMN", "TRUNCATE", "DROP SCHEMA")):
    sys.exit("REFUSED: destructive SQL found in generated migration")

expected = (
    "operational_zones", "zone_geometry_versions", "observation_zone_matches",
    "domain_tasks", "task_assignments", "task_findings", "evidence_media", "evidence_links",
)
for table in expected:
    if f'CREATE TABLE "{table}"' not in sql:
        sys.exit(f"REFUSED: missing expected table: {table}")
if sql.count("CREATE TABLE ") != len(expected):
    sys.exit("REFUSED: migration creates extra tables")

# Drizzle should emit composite UNIQUE constraints inside new CREATE TABLEs.
for name in (
    "operational_zones_id_org_uq", "zone_geometry_versions_id_org_uq",
    "domain_tasks_id_org_uq", "task_findings_id_org_uq", "evidence_media_id_org_uq",
):
    if name not in sql:
        sys.exit(f"REFUSED: missing composite unique constraint: {name}")

print("PASS: 0012 additive 8 tables, required org-scoped unique keys present")
print("IMPORTANT: inspect FK order and generated SQL before running migrate")
