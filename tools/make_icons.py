"""Draws the app icon: a top-down meal-prep box with rice, greens and protein."""
from PIL import Image, ImageDraw
import random
def draw(size, inset):
    S = size*4; im = Image.new('RGB', (S, S), (31, 92, 74)); d = ImageDraw.Draw(im)
    # soft lighter top-left glow
    for i in range(40):
        r = int(S*1.1) - i*int(S*0.012)
        c = (31+i//3, 92+i//3, 74+i//4)
        d.ellipse([-r//2, -r//2, r//2+int(S*0.1), r//2+int(S*0.1)], fill=c)
    p = int(S*inset); w = S-2*p
    # container
    d.rounded_rectangle([p, p+int(w*0.06), S-p, S-p-int(w*0.02)], radius=int(w*0.16), fill=(18, 52, 42))
    d.rounded_rectangle([p, p, S-p, S-p-int(w*0.06)], radius=int(w*0.16), fill=(246, 241, 230))
    g = int(w*0.07); x0, y0, x1, y1 = p+g, p+g, S-p-g, S-p-int(w*0.06)-g
    mx = x0+int((x1-x0)*0.52); my = y0+int((y1-y0)*0.5); gap = int(w*0.035)
    rr = int(w*0.08)
    # rice compartment (left)
    d.rounded_rectangle([x0, y0, mx-gap//2, y1], radius=rr, fill=(255, 252, 244))
    rnd = random.Random(4)
    for _ in range(42):
        cx = rnd.randint(x0+rr//2, mx-gap//2-rr//2); cy = rnd.randint(y0+rr//2, y1-rr//2)
        L = int(w*0.035); W = int(w*0.012); ang = rnd.choice([0, 1])
        box = [cx-L//2, cy-W//2, cx+L//2, cy+W//2] if ang else [cx-W//2, cy-L//2, cx+W//2, cy+L//2]
        d.rounded_rectangle(box, radius=W//2, fill=(232, 222, 200))
    # greens (top right)
    d.rounded_rectangle([mx+gap//2, y0, x1, my-gap//2], radius=rr, fill=(212, 236, 214))
    gx0, gy0, gx1, gy1 = mx+gap//2, y0, x1, my-gap//2
    for (fx, fy, fr) in [(.3, .38, .2), (.62, .32, .22), (.46, .66, .2), (.78, .68, .17)]:
        cx = gx0+(gx1-gx0)*fx; cy = gy0+(gy1-gy0)*fy; r = (gx1-gx0)*fr
        d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(64, 145, 82))
        d.ellipse([cx-r*0.55, cy-r*0.75, cx+r*0.25, cy-r*0.05], fill=(98, 176, 108))
    # protein (bottom right): salmon/chicken slices
    px0, py0, px1, py1 = mx+gap//2, my+gap//2, x1, y1
    d.rounded_rectangle([px0, py0, px1, py1], radius=rr, fill=(250, 228, 214))
    for k in range(3):
        sx = px0+(px1-px0)*(0.12+k*0.27); sw = (px1-px0)*0.22
        d.rounded_rectangle([sx, py0+(py1-py0)*0.18, sx+sw, py1-(py1-py0)*0.18], radius=int(sw*0.35), fill=(236, 128, 92))
        d.line([sx+sw*0.3, py0+(py1-py0)*0.3, sx+sw*0.7, py0+(py1-py0)*0.55], fill=(248, 180, 150), width=max(2, int(w*0.012)))
    return im.resize((size, size), Image.LANCZOS)
draw(180, 0.16).save('icons/apple-touch-icon-v2.png')
draw(192, 0.16).save('icons/icon-192-v2.png')
draw(512, 0.16).save('icons/icon-512-v2.png')
draw(512, 0.24).save('icons/icon-maskable-512-v2.png')
