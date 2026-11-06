"""Build orientation-ready STL parts for the printing shop."""
from pathlib import Path
import trimesh, numpy as np, math
R=Path(__file__).resolve().parents[1];D=R/'STL_PRINT'
inputs=[
 ('01_LISTEN_BASE.stl','PRINT_01_CASE_BASE.stl','default'),
 ('02_LISTEN_FRONT_LID.stl','PRINT_02_PLAIN_LID.stl','flip'),
 ('02B_LID_EMBOSSED_SINGLE_COLOR.stl','PRINT_02B_EMBOSSED_LID_ONE_COLOR.stl','flip'),
 ('03_LISTEN_TRAY.stl','PRINT_03_ELECTRONICS_TRAY.stl','default'),
 ('04_LEFT_COSMETIC_MAST.stl','PRINT_04_COSMETIC_MAST_PRINT_2.stl','up'),
 ('09_LEFT_FOOT.stl','PRINT_05_BOTTOM_FOOT_PRINT_2.stl','up'),
 ('06_SOCKET_PLUG_OPTIONAL.stl','PRINT_06_OPTIONAL_MAST_PLUG_PRINT_2.stl','default')
]
for source,dest,mode in inputs:
    m=trimesh.load(D/source,force='mesh',process=True)
    if mode=='flip':m.apply_transform(trimesh.transformations.rotation_matrix(math.pi,[1,0,0]))
    elif mode=='up':m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0]))
    m.apply_translation([-m.bounds[0,0],-m.bounds[0,1],-m.bounds[0,2]])
    m.export(D/dest)
    test=trimesh.load(D/dest,force='mesh',process=True)
    assert test.is_watertight and np.abs(test.bounds[0,2])<.001
    print(dest,'bounds',np.round(test.extents,2).tolist(),'watertight',test.is_watertight)
