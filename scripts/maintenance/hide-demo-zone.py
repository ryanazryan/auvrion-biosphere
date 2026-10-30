from pathlib import Path
p = Path('src/server/workflow/workspace-queries.ts')
s = p.read_text(encoding='utf-8')
old = '.where(eq(operationalZones.organizationId, organizationId))\n    .orderBy(asc(operationalZones.code))'
new = '.where(and(eq(operationalZones.organizationId, organizationId), ne(operationalZones.code, "WC013-DEMO")))\n    .orderBy(asc(operationalZones.code))'
if old not in s and new not in s:
    raise SystemExit('Anchor listWorkspaceZones tidak cocok; file tetap utuh. Periksa kode lokal.')
if new not in s:
    s=s.replace('import { and, asc, desc, eq, isNull } from "drizzle-orm";', 'import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";',1)
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')
    print('Updated Supervisor zone list')
else: print('Supervisor zone filter already installed')
p=Path('src/server/gis/zone-service.ts')
s=p.read_text(encoding='utf-8')
old='.where(eq(operationalZones.organizationId, organizationId))'
new='.where(and(eq(operationalZones.organizationId, organizationId), ne(operationalZones.code, "WC013-DEMO")))'
if old not in s and new not in s:
    raise SystemExit('Anchor zone-service tidak cocok; file tetap utuh.')
if new not in s:
    s=s.replace('import { asc, eq } from "drizzle-orm";','import { and, asc, eq, ne } from "drizzle-orm";',1)
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')
    print('Updated Operator zone list')
else: print('Operator zone filter already installed')
