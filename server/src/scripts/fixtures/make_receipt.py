"""Renders a plausible Indian retail receipt so the OCR path can be tested for real."""

from PIL import Image, ImageDraw, ImageFont
import pathlib

W, H = 620, 900
img = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(img)


def font(size, bold=False):
    for name in (
        'C:/Windows/Fonts/consolab.ttf' if bold else 'C:/Windows/Fonts/consola.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


y = 40


def line(text, size=22, bold=False, gap=32, center=False):
    global y
    f = font(size, bold)
    x = (W - d.textlength(text, font=f)) / 2 if center else 50
    d.text((x, y), text, fill='black', font=f)
    y += gap


line('DMART', 40, True, 58, center=True)
line('Avenue Supermarts Ltd', 18, False, 28, center=True)
line('Whitefield, Bengaluru 560066', 18, False, 26, center=True)
line('GSTIN: 29AACCA8432H1ZS', 18, False, 40, center=True)
line('-' * 44, 20, False, 34)
line('Bill No: 4412/2026     Date: 14/09/2026', 19, False, 26)
line('Time: 19:42          Counter: 07', 19, False, 34)
line('-' * 44, 20, False, 34)

items = [
    ('Aashirvaad Atta 5kg', '1', '289.00'),
    ('Amul Gold Milk 1L', '3', '198.00'),
    ('Tata Salt 1kg', '2', '56.00'),
    ('Surf Excel 2kg', '1', '525.00'),
    ('Fortune Oil 5L', '1', '899.00'),
    ('Britannia Bread', '2', '90.00'),
    ('Colgate Toothpaste', '1', '145.00'),
    ('Dettol Handwash', '2', '178.00'),
]
for name, qty, amount in items:
    f = font(19)
    d.text((50, y), name, fill='black', font=f)
    d.text((430, y), qty, fill='black', font=f)
    d.text((490, y), amount, fill='black', font=f)
    y += 30

y += 10
line('-' * 44, 20, False, 34)
line('Sub Total                      2380.00', 20, False, 28)
line('CGST 2.5%                         21.40', 19, False, 26)
line('SGST 2.5%                         21.40', 19, False, 34)
line('-' * 44, 20, False, 36)
line('TOTAL                        Rs 2380.00', 24, True, 44)
line('-' * 44, 20, False, 34)
line('Paid by UPI - HDFC Bank', 19, False, 28)
line('UPI Ref: 419238712344', 18, False, 40)
line('Thank you for shopping!', 19, False, 28, center=True)

out = pathlib.Path(__file__).with_name('receipt.png')
img.save(out)
print(out)
