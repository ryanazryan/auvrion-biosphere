#!/usr/bin/env python3
"""Validate expected WC-007 additive migration; optionally normalize 3 malformed tokens.

Run AFTER drizzle-kit generate. This program never connects to a database and
refuses to operate on an unexpected SQL migration name or destructive SQL.
"""
from pathlib import Path
import argparse
import re

SQL = Path("drizzle/0011_wc007_domain_foundation.sql")
TABLES = (
    "case_observation_links",
    "domain_cases",
    "ecosystem_profiles",
    "environmental_measurements",
    "observation_provenance",
    "observation_sources",
    "observations",
)
REPLACEMENTS = {
    "IS NOTNULL": "IS NOT NULL",
    "restrictON UPDATE": "restrict ON UPDATE",
    "USINGbtree": "USING btree",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix", action="store_true", help="Fix only three known whitespace issues")
    args = parser.parse_args()
    if not SQL.is_file():
        raise SystemExit(f"WC007_REJECT: missing {SQL}")
    before = SQL.read_text(encoding="utf-8")
    if re.search(r"\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA|DATABASE|TYPE)\b|\bDELETE\s+FROM\b", before, re.I):
        raise SystemExit("WC007_REJECT: unexpected destructive SQL")
    for tbl in TABLES:
        if f'CREATE TABLE "{tbl}"' not in before:
            raise SystemExit(f"WC007_REJECT: missing expected CREATE TABLE {tbl}")
    actual = re.findall(r'CREATE TABLE "([^"]+)"', before)
    if len(actual) != len(TABLES) or set(actual) != set(TABLES):
        raise SystemExit(f"WC007_REJECT: unexpected table set: {actual}")
    fixed = before
    for old, new in REPLACEMENTS.items():
        count = fixed.count(old)
        if count:
            print(f"Found {count} x malformed token: {old!r}")
            if args.fix:
                fixed = fixed.replace(old, new)
    if fixed != before:
        if not args.fix:
            raise SystemExit("WC007_REJECT: run again with --fix before migration")
        SQL.write_text(fixed, encoding="utf-8", newline="\n")
        print(f"Fixed known generated SQL whitespace in {SQL}")
    elif any(word in fixed for word in REPLACEMENTS):
        raise SystemExit("WC007_REJECT: bad generated SQL still present")
    if fixed.count('CREATE TYPE "public".') != 4:
        raise SystemExit("WC007_REJECT: expected enums missing")
    print(f"PASS: additive {SQL}, exactly {len(TABLES)} new tables; no destructive SQL found")
    print("Note: syntax/integrity PASS requires executing migration on isolated PostgreSQL.")


if __name__ == "__main__":
    main()
