"""Dimensioned fit-check reference (components are engineering envelopes, not certified footprints)."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'PREVIEW'/'05_COMPONENT_LAYOUT.png'
plt.rcParams.update({'font.family':'DejaVu Sans'})
fig, ax=plt.subplots(figsize=(13,8),dpi=170)
fig.patch.set_facecolor('#f8fbf9');ax.set_facecolor('#f8fbf9')
# view XY, width 126, height124
border=patches.FancyBboxPatch((-63,-62),126,124,boxstyle='round,pad=0,rounding_size=15.5',facecolor='#f1f5f3',edgecolor='#104b39',lw=3)
ax.add_patch(border)
tray=patches.FancyBboxPatch((-56,-53),112,106,boxstyle='round,pad=0,rounding_size=8',facecolor='#e6efea',edgecolor='#659681',lw=2,linestyle='--')
ax.add_patch(tray)
# powerbank projected below the tray
ax.add_patch(patches.FancyBboxPatch((-42,-29),84,58,boxstyle='round,pad=0,rounding_size=3',facecolor='#e1a44b',edgecolor='#b27d2b',lw=1.6,linestyle='--',alpha=.23))
def block(x,y,w,h,color,label,textcol='#172b26'):
    b=patches.FancyBboxPatch((x-w/2,y-h/2),w,h,boxstyle='round,pad=0,rounding_size=1.9',facecolor=color,edgecolor='#466458',linewidth=1.5)
    ax.add_patch(b)
    ax.text(x,y,label,ha='center',va='center',fontsize=9.6,color=textcol,fontweight='bold',linespacing=1.5)
block(-26.5,24.5,53,29,'#abc8be','ESP32\n53 × 29')
block(-27,-19,47,35,'#d2ede0','Breadboard 170\n47 × 35')
block(28,25,42,24,'#b2d0dc','MicroSD\n42 × 24')
block(28,-14,38,22,'#c4b8e6','DS3231\n38 × 22')
for x in (-48,48):
 for y in (-45,45):
  ax.add_patch(patches.Circle((x,y),radius=3.25,edgecolor='#4d685c',facecolor='white',lw=1.5))
# case acoustic hole is on the bottom edge, NOT in tray
ax.annotate('INMP441 di dinding bawah\nport akustik Ø2,9 mm',xy=(28,-62),xytext=(5,-88),arrowprops={'arrowstyle':'->','color':'#28634a','lw':1.5},fontsize=10,color='#124733',ha='center')
ax.annotate('',xy=(-63,67),xytext=(63,67),arrowprops={'arrowstyle':'<->','color':'#1e4638'})
ax.text(0,69,'126 mm',ha='center',va='bottom',fontsize=13,fontweight='bold',color='#174b39')
ax.annotate('',xy=(72,-62),xytext=(72,62),arrowprops={'arrowstyle':'<->','color':'#1e4638'})
ax.text(75,0,'124 mm',ha='left',va='center',rotation=90,fontsize=13,fontweight='bold',color='#174b39')
ax.text(0,-73,'Garis putus-putus kuning = ruang powerbank di bawah tray\n84 × 58 × 18 mm (envelope CAD, bukan ukuran produk tertentu)',ha='center',va='top',color='#8b641f',fontsize=10)
ax.set_xlim(-85,92);ax.set_ylim(-101,84);ax.set_aspect('equal');ax.axis('off')
fig.suptitle('AUVRION BIOSPHERE  ·  LISTEN V2  /  INTERNAL FIT CHECK',fontsize=17,fontweight='bold',color='#123b2c',y=.99)
fig.savefig(p,bbox_inches='tight',pad_inches=.24)
print(str(p),p.stat().st_size)
