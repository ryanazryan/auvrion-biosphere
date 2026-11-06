"""Auvrion Biosphere LISTEN V2 - editable CadQuery design source.
All units mm. Requires CadQuery 2.x and Pillow+OpenCV for optional logo; absolute parameters below.
Prototype: NOT waterproof/IP-rated and not dimensionally validated against buyer's components.
"""
from pathlib import Path
import cadquery as cq
import numpy as np
import cv2
from PIL import Image
from OCP.BRepCheck import BRepCheck_Analyzer

ROOT=Path(__file__).resolve().parents[1]
LOGO_PNG=ROOT/'REFERENCE'/'auvrion-biosphere-wordmark.png'
STL=ROOT/'STL_PRINT'
STEP=ROOT/'STEP_CAD'
for d in (STL,STEP):d.mkdir(parents=True,exist_ok=True)

# Print geometry
W=126.0; H=124.0; BASE_Z=49.5; LID_T=4.0; R=15.5
WALL=3.4; FLOOR=3.4
LID_TOP=BASE_Z+LID_T
TRAY_Z=25.4; TRAY_T=2.8
PILLAR_X=48.0; PILLAR_Y=45.0
MAST_X=29.5; MAST_SOCKET_Z=24.5

# Rounded rectangular solid using robust vertical fillets

def rbox(w,h,d,r,z=0,x=0,y=0):
    return (cq.Workplane('XY').box(w,h,d,centered=(True,True,False))
            .edges('|Z').fillet(r).translate((x,y,z)))

def cyl(x,y,z,r,h,axis=(0,0,1)):
    return cq.Workplane('XY').newObject([cq.Solid.makeCylinder(r,h,cq.Vector(x,y,z),cq.Vector(*axis))])

def cutbox(w,h,d,x=0,y=0,z=0):
    return cq.Workplane('XY').box(w,h,d,centered=True).translate((x,y,z))

print('building shell...',flush=True)
outer=rbox(W,H,BASE_Z,R)
inner=rbox(W-2*WALL,H-2*WALL,BASE_Z-FLOOR+1.0,R-WALL,z=FLOOR)
base=outer.cut(inner)
# Tray pillars fused with floor. M3 direct plastic pilot holes, conservative first build.
for x in (-PILLAR_X,PILLAR_X):
    for y in (-PILLAR_Y,PILLAR_Y):
        base=base.union(cyl(x,y,FLOOR,4.8,TRAY_Z-FLOOR))
        base=base.cut(cyl(x,y,TRAY_Z-13.2,1.32,13.3))

# Battery locating rails inside the back cover; 84x58x18 mm maximum envelope.
for sx in (-1,1):
    base=base.union(cutbox(3.0,29.0,6.0,x=sx*44.5,y=0,z=FLOOR+3.0))
for sy in (-1,1):
    base=base.union(cutbox(25.0,3.0,6.0,x=0,y=sy*32.0,z=FLOOR+3.0))

# Smooth front cover (no visible face screws): 4 screws through sides into lid skirt tabs.
# Four x-axis bore paths through each side wall at y=+-31, z=46.3.
for sx in (-1,1):
    for y in (-31.0,31.0):
        # side screw clearance through body wall, head recess .7 mm
        startx=-W/2-0.3 if sx==-1 else W/2+0.3
        direction=(sx,0,0) if sx==-1 else (-sx,0,0)
        # from outside inward: +/- sign direction handles this
        base=base.cut(cyl(startx,y,46.0,1.75,4.8,axis=direction))
        base=base.cut(cyl(startx,y,46.0,2.95,1.0,axis=direction))

# USB cable opening at left, sized for cable access, not panel connector.
# Through x side wall; center y=25, z=35.0; 18mm vertical(y) x 11mm depth(z)
base=base.cut(cutbox(11.0,19.0,11.0,x=-60.0,y=25.0,z=35.2))
# Bottom USB/charging cable pass-through, also not a precisely mounted USB-C socket.
base=base.cut(cutbox(17.0,10.0,9.0,x=-19.0,y=-60.0,z=13.0))
# Down-facing microphone acoustic bore in bottom wall; room for membrane/filter.
base=base.cut(cyl(28.0,-H/2-0.4,37.0,1.45,5.5,axis=(0,1,0)))
base=base.cut(cyl(28.0,-H/2-0.4,37.0,3.45,0.9,axis=(0,1,0)))
# INMP441 board 14x14mm (nominal) side guides on lower interior wall.
# Add thin acoustic membrane + removable adhesive to secure mic; guide is not a seal.
for gx in (18.6,37.4):
    base=base.union(cutbox(2.2,4.4,16.2,x=gx,y=-56.5,z=37.0))
base=base.union(cutbox(20.4,4.4,2.0,x=28.0,y=-56.5,z=28.7))
# Two mounting sockets in upper edge for OPTIONAL decorative masts (non RF).
for x in (-MAST_X,MAST_X):
    # reinforced socket: without this a hollow shell only holds the peg over 3.4mm wall
    base=base.union(cyl(x,H/2-7.7,MAST_SOCKET_Z,5.7,6.9,axis=(0,1,0)))
    base=base.cut(cyl(x,H/2+0.1,MAST_SOCKET_Z,2.55,8.0,axis=(0,-1,0)))
# Two tiny optional black feet, like the user reference. Both use friction pegs.
for x in (-32.0,32.0):
    base=base.union(cyl(x,-H/2+0.8,14.2,5.0,6.4,axis=(0,1,0)))
    base=base.cut(cyl(x,-H/2-0.1,14.2,1.82,7.2,axis=(0,1,0)))

# Front lid: low rounded perimeter + skirt for self-alignment.
print('building lid...',flush=True)
lid=rbox(W,H,LID_T,R,z=BASE_Z)
# Very subtle top edge radius, no front visible screws.
try: lid=lid.edges('>Z').fillet(1.7)
except Exception as e: print('lid top fillet skipped',str(e)[:100],flush=True)
skirt_outer=rbox(W-2*WALL-1.6,H-2*WALL-1.6,4.6,R-WALL-0.8,z=BASE_Z-4.6)
skirt_inner=rbox(W-2*WALL-7.8,H-2*WALL-7.8,5.0,R-WALL-3.8,z=BASE_Z-4.7)
lid=lid.union(skirt_outer.cut(skirt_inner))
for sx in (-1,1):
    for y in (-31.0,31.0):
        # Side screw plastic block lands within liner skirt, 9mm thick along Z
        tab=cutbox(8.5,12.5,7.2,x=sx*54.0,y=y,z=BASE_Z-2.2)
        lid=lid.union(tab)
        # hole axes in x, rad 1.27 for M3 threadforming, 9mm usable length
        startx=sx*59.0
        lid=lid.cut(cyl(startx,y,46.0,1.27,9.2,axis=(-sx,0,0)))

# Removable electronics tray, corner screw ports and generic zip-tie slots.
print('building tray...',flush=True)
tray=rbox(112.0,106.0,TRAY_T,8.0,z=TRAY_Z)
for x in (-PILLAR_X,PILLAR_X):
    for y in (-PILLAR_Y,PILLAR_Y):
        tray=tray.cut(cyl(x,y,TRAY_Z-0.2,1.75,TRAY_T+0.4))
        # add shallow head countersinks from top surface
        tray=tray.cut(cyl(x,y,TRAY_Z+TRAY_T-1.2,3.0,1.4))
# cable tie slots, avoid board footprints: two per component, place outside envelope
slots=[(-54.0,1.5),(-3.0,1.5),(-54.0,-43.0),(-3.0,-43.0),
       (2.0,41.0),(51.0,41.0),(2.0,-29.0),(51.0,-29.0)]
for x,y in slots:
    tray=tray.cut(cutbox(2.8,8.0,TRAY_T+1.0,x=x,y=y,z=TRAY_Z+TRAY_T/2))
# cable routing between upper and lower volumes
for x,y in [(0.0,0.0),(0.0,-40.0),(1.0,8.0)]:
    tray=tray.cut(cutbox(9.0,5.0,TRAY_T+1.0,x=x,y=y,z=TRAY_Z+TRAY_T/2))

# Optional removable masts; deliberately have NO electrical/antenna function.
print('building masts...',flush=True)
masts=[]
for x in (-MAST_X,MAST_X):
    peg=cyl(x,H/2-7.2,MAST_SOCKET_Z,2.31,7.0,axis=(0,1,0))
    stem=cyl(x,H/2-0.2,MAST_SOCKET_Z,3.35,31.0,axis=(0,1,0))
    head=cq.Workplane('XY').sphere(3.35).translate((x,H/2+30.5,MAST_SOCKET_Z))
    # trim lower hemisphere? intersect with stem naturally
    masts.append(peg.union(stem).union(head))

# Two bottom cosmetic feet; friction pegs, not structural mounts.
feet=[]
for x in (-32.0,32.0):
    peg=cyl(x,-H/2+0.3,14.2,1.66,5.6,axis=(0,1,0))
    cap=cyl(x,-H/2-3.8,14.2,3.7,4.2,axis=(0,1,0))
    feet.append(peg.union(cap))

# Optional plug for socket if omit decoration (one STL, print twice).
plug=cyl(0,0,0,2.30,7.0)
plug=plug.union(cyl(0,0,7.0,3.8,1.5))

# Component envelope solids: reference ONLY, NOT print.
# Assumed placements/clearance envelopes, not precise clone dimensions.
models={
    'ESP32_30PIN_53x29x11':(-26.5,24.5,53.0,29.0,11.0),
    'BREADBOARD_170_47x35x9p5':(-27.0,-19.0,47.0,35.0,9.5),
    'MICROSD_42x24x11':(28.0,25.0,42.0,24.0,11.0),
    'DS3231_38x22x14':(28.0,-14.0,38.0,22.0,14.0),
}
components=[]
for name,(x,y,w,h,d) in models.items():
    components.append((name,rbox(w,h,d,1.2,x=x,y=y,z=TRAY_Z+TRAY_T+0.8)))
components.append(('POWERBANK_ENVELOPE_84x58x18',rbox(84,58,18,2.0,z=FLOOR+0.5)))

# Vectorization from user's attached transparent wordmark PNG.
# Per-color 3D marks remain independent geometries for 2-color FDM/paint.
# Relief sits on front face, centered. The final print should be painted or color-changed.
print('vectorizing logo...',flush=True)
rgba=np.array(Image.open(LOGO_PNG).convert('RGBA'))
a=rgba[:,:,3]
# Threshold separates original charcoal from green, preserving shapes/holes.
opaque=a>90
green=(rgba[:,:,1].astype(float)>rgba[:,:,0].astype(float)*1.18) & opaque
black=opaque & ~green
ys,xs=np.where(opaque)
xc=(xs.min()+xs.max())/2.0; yc=(ys.min()+ys.max())/2.0
sc=96.0/float(xs.max()-xs.min())

def logo_solids(mask,label):
    contours,hier=cv2.findContours(mask.astype('uint8'),cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    if hier is None: return []
    hier=hier[0]
    polys=[]
    # Consecutive contours from cv2.RETR_CCOMP grouped by parent index.
    for i,cnt in enumerate(contours):
        if hier[i,3]!=-1 or abs(cv2.contourArea(cnt))<75:continue
        pts=cv2.approxPolyDP(cnt,1.25,True).reshape(-1,2)
        if len(pts)<3:continue
        def conv(pt): return (round((float(pt[0])-xc)*sc,4), round((yc-float(pt[1]))*sc,4))
        outer=[conv(p) for p in pts]
        p=cq.Workplane('XY').polyline(outer).close()
        child=hier[i,2]
        while child!=-1:
            if cv2.contourArea(contours[child])>90:
                holepts=cv2.approxPolyDP(contours[child],1.0,True).reshape(-1,2)
                if len(holepts)>=3: p=p.polyline([conv(q) for q in holepts]).close()
            child=hier[child,0]
        try:
            sh=p.extrude(0.72,combine=False).translate((0,0,LID_TOP))
            polys.extend(sh.solids().vals())
        except Exception as e: print('logo contour skipped',label,i,str(e)[:80],flush=True)
    return polys

green_solids=logo_solids(green,'green'); dark_solids=logo_solids(black,'dark')
print('logo solids green',len(green_solids),'dark',len(dark_solids),flush=True)

# Export shapes individually and assembly; do not combine logo to casing, so multiple materials possible.
parts=[('01_LISTEN_BASE',base),('02_LISTEN_FRONT_LID',lid),('03_LISTEN_TRAY',tray),
       ('04_LEFT_COSMETIC_MAST',masts[0]),('05_RIGHT_COSMETIC_MAST',masts[1]),('06_SOCKET_PLUG_OPTIONAL',plug),
       ('09_LEFT_FOOT',feet[0]),('10_RIGHT_FOOT',feet[1])]

def asshape(x):
    return x.val() if isinstance(x,cq.Workplane) else x

def comp(shapes):
    return cq.Compound.makeCompound([asshape(x) for x in shapes])

for name,p in parts:
    s=asshape(p)
    assert s.isValid(),f'invalid {name}'
    cq.exporters.export(s,str(STL/(name+'.stl')),exportType='STL',tolerance=0.09,angularTolerance=0.17)
    cq.exporters.export(s,str(STEP/(name+'.step')),exportType='STEP')
    print('exported',name,flush=True)

for name,shapes in [('07_BRANDING_GREEN',green_solids),('08_BRANDING_DARK',dark_solids)]:
    if shapes:
        sh=comp(shapes)
        cq.exporters.export(sh,str(STL/(name+'.stl')),exportType='STL',tolerance=0.06,angularTolerance=0.13)
        cq.exporters.export(sh,str(STEP/(name+'.step')),exportType='STEP')
        print('exported',name,flush=True)

# One-color lid variant with attached emboss; ideal for ordinary single-extruder FDM.
# Face can be painted after printing. Use INSTEAD of plain lid+separate colored logos.
embossed_lid=asshape(lid).fuse(comp(green_solids),comp(dark_solids))
assert embossed_lid.isValid() and len(embossed_lid.Solids())==1
cq.exporters.export(embossed_lid,str(STL/'02B_LID_EMBOSSED_SINGLE_COLOR.stl'),exportType='STL',tolerance=0.08,angularTolerance=0.15)
cq.exporters.export(embossed_lid,str(STEP/'02B_LID_EMBOSSED_SINGLE_COLOR.step'),exportType='STEP')
print('exported 02B integrated embossed lid',flush=True)

# Print assembly: only printable components; masts positioned at socket fit; logo relief.
assembly=cq.Assembly(name='AUVRION_LISTEN_V2_COMPACT')
colors={
 '01_LISTEN_BASE':cq.Color(0.92,0.94,0.94),
 '02_LISTEN_FRONT_LID':cq.Color(0.98,0.99,0.99),
 '03_LISTEN_TRAY':cq.Color(0.16,0.38,0.30),
 '04_LEFT_COSMETIC_MAST':cq.Color(0.13,0.14,0.16),
 '05_RIGHT_COSMETIC_MAST':cq.Color(0.13,0.14,0.16),
 '09_LEFT_FOOT':cq.Color(0.13,0.14,0.16),
 '10_RIGHT_FOOT':cq.Color(0.13,0.14,0.16),
}
for name,p in parts:
    if name!='06_SOCKET_PLUG_OPTIONAL': assembly.add(asshape(p),name=name,color=colors[name])
if green_solids: assembly.add(comp(green_solids),name='AUVRION_GREEN_LOGO',color=cq.Color(0.16,0.57,0.40))
if dark_solids: assembly.add(comp(dark_solids),name='AUVRION_DARK_WORDMARK',color=cq.Color(0.17,0.20,0.19))
assembly.save(str(STEP/'00_LISTEN_V2_FULL_ASSEMBLY.step'),exportType='STEP')
print('assembly exported',flush=True)

# Reference geometry to inspect approximate fit, not actual printed components.
fit=cq.Assembly(name='LISTEN_COMPONENT_CLEARANCE_REFERENCE')
fit.add(asshape(base),name='base',color=cq.Color(.83,.85,.86))
fit.add(asshape(tray),name='tray',color=cq.Color(.12,.45,.29))
fit.add(asshape(lid),name='lid',color=cq.Color(.93,.95,.96))
for name,shape in components:
    col = cq.Color(.12,.30,.65) if 'ESP32' in name else cq.Color(.18,.6,.42) if 'BREADBOARD' in name else cq.Color(.90,.63,.18) if 'POWERBANK' in name else cq.Color(.38,.28,.6)
    fit.add(asshape(shape),name=name,color=col)
fit.save(str(STEP/'09_ELECTRONICS_FIT_REFERENCE_NOT_FOR_PRINT.step'),exportType='STEP')

# STL sanity checks. Separate STEP file needed for best import to FreeCAD.
import trimesh
for name,p in parts:
    if name=='06_SOCKET_PLUG_OPTIONAL':continue
    m=trimesh.load_mesh(STL/(name+'.stl'),force='mesh',process=True)
    print('CHECK',name,'water',m.is_watertight,'bounds',np.round(m.bounds,1).tolist(),'volume_cc',round(m.volume/1000,1),'faces',len(m.faces),flush=True)
    assert m.is_watertight, f'Mesh {name} not watertight'
print('DONE',flush=True)
