"""Render CAD previews with VTK (not an AI rendering)."""
import vtk
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
PRE=ROOT/'PREVIEW';PRE.mkdir(exist_ok=True)
STL=ROOT/'STL_PRINT'
WHITE=(0.85,0.89,0.89); LID=(0.955,0.970,0.968); GREEN=(.08,.38,.25); DARK=(.13,.16,.15)

PARTS=[
 ('01_LISTEN_BASE',WHITE),('02_LISTEN_FRONT_LID',LID),('03_LISTEN_TRAY',(.18,.43,.32)),
 ('04_LEFT_COSMETIC_MAST',(.14,.15,.17)),('05_RIGHT_COSMETIC_MAST',(.14,.15,.17)),
 ('07_BRANDING_GREEN',GREEN),('08_BRANDING_DARK',DARK),
 ('09_LEFT_FOOT',(.12,.13,.14)),('10_RIGHT_FOOT',(.12,.13,.14))
]

def make_actor(name,color,opacity=1,trans=(0,0,0)):
    reader=vtk.vtkSTLReader();reader.SetFileName(str(STL/(name+'.stl')));reader.Update()
    normal=vtk.vtkPolyDataNormals();normal.SetInputConnection(reader.GetOutputPort());normal.ConsistencyOn();normal.SplittingOff();normal.AutoOrientNormalsOn();normal.Update()
    mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normal.GetOutputPort())
    actor=vtk.vtkActor();actor.SetMapper(mapper)
    actor.GetProperty().SetColor(*color);actor.GetProperty().SetOpacity(opacity)
    actor.GetProperty().SetAmbient(.37);actor.GetProperty().SetDiffuse(.58)
    actor.GetProperty().SetSpecular(.06);actor.GetProperty().SetSpecularPower(18)
    actor.AddPosition(*trans)
    return actor

def draw_scene(out,items,camera=(174,107,290),focal=(0,10,28),scale=107,background=(.96,.974,.97)):
    ren=vtk.vtkRenderer();ren.SetBackground(*background)
    for item in items:
        if len(item)==2: name,col=item;opa=1;shift=(0,0,0)
        elif len(item)==4: name,col,opa,shift=item
        ren.AddActor(make_actor(name,col,opa,shift))
    rw=vtk.vtkRenderWindow();rw.AddRenderer(ren)
    rw.SetSize(1400,1120);rw.SetMultiSamples(8)
    cam=ren.GetActiveCamera();cam.SetFocalPoint(*focal);cam.SetPosition(*camera);cam.SetViewUp(0,1,0)
    cam.ParallelProjectionOn();cam.SetParallelScale(scale)
    ren.ResetCameraClippingRange()
    # broad white studio light and rim fill
    for pos,power in [((140,250,380),.92),((-230,20,340),.48),((10,-100,200),.28)]:
        l=vtk.vtkLight();l.SetLightTypeToSceneLight();l.SetPosition(*pos);l.SetFocalPoint(0,0,22)
        l.SetColor(1,1,1);l.SetIntensity(power);ren.AddLight(l)
    rw.Render()
    w2i=vtk.vtkWindowToImageFilter();w2i.SetInput(rw);w2i.SetInputBufferTypeToRGB();w2i.ReadFrontBufferOff();w2i.Update()
    writer=vtk.vtkPNGWriter();writer.SetInputConnection(w2i.GetOutputPort());writer.SetFileName(str(out));writer.Write()
    rw.Finalize()
    print(out,'size',out.stat().st_size,flush=True)

draw_scene(PRE/'01_ASSEMBLED.png',PARTS,camera=(95,64,290),focal=(0,9,30),scale=96)
draw_scene(PRE/'02_FRONT_FACE.png',PARTS,camera=(0,0,300),focal=(0,15,30),scale=94)
exploded=[]
for name,col in PARTS:
    if name=='01_LISTEN_BASE':delta=(0,0,-18)
    elif 'MAST' in name or 'FOOT' in name:delta=(0,0,-18)
    elif name=='03_LISTEN_TRAY':delta=(8,4,24)
    else:delta=(18,16,78)
    exploded.append((name,col,1.0,delta))
draw_scene(PRE/'03_EXPLODED.png',exploded,camera=(240,90,280),focal=(10,20,53),scale=135)
# Transparent shell to show tray and battery pocket; lid hidden.
internals=[(name,col,.30 if name=='01_LISTEN_BASE' else 1.0,(0,0,0)) for name,col in PARTS if name not in ('02_LISTEN_FRONT_LID','07_BRANDING_GREEN','08_BRANDING_DARK')]
draw_scene(PRE/'04_INTERNAL_TRAY.png',internals,camera=(150,115,215),focal=(0,0,25),scale=89,background=(.955,.97,.985))
