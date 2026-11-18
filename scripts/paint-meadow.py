"""Rasterize StrinCube's original seamless 16px meadow tiles (stdlib only)."""
from pathlib import Path
import struct
import zlib

OUT = Path(__file__).resolve().parents[1] / 'src/assets/terrain'
OUT.mkdir(parents=True, exist_ok=True)

# Small groups of blades rather than independent noisy pixels. Midtones dominate
# so highlights don't turn the whole meadow into a high-frequency checkerboard.
GRASS = [
    'bbbbbccbbbbbabbc', 'cbbbbccdbbbaabbc', 'ccbbcdbbbbcbbbbb', 'bbbcbbbbbcdbbbab',
    'abbabbccbbbbbaab', 'aabbbccdbbbbcbbb', 'bbbccdbbbbbbdcbb', 'bbbcbbabbccbbbbb',
    'bbbbbbaabcdcbbcc', 'cbbbcbbbbcbbbbcd', 'cbbdcbbbabbcabbb', 'bbbbbbbbaabcbbbc',
    'bbcbbccbbbbbbccb', 'bbcdbcdbbcbbbcdb', 'bbbcbbbabdcbbbbb', 'bbbbbbbaabbbbcbb',
]
SOIL = [
    'nnnoonnnnmmnnnon', 'nnooonnnmmnnnoon', 'nnnonnnppnnnnoon', 'mnnnnnpqqpnnnnnm',
    'mmnnnnppnnnonnmm', 'nnnoonnnnnooonnn', 'nnooonnmmnnonppn', 'nnonnnmmnnnnppqn',
    'nnnnpnnnnnnnnppn', 'nmnppqnnnoonnnnn', 'mmnnppnnnooonnnm', 'nnnnnnnmmnoonnnn',
    'nnnoonnmmnnnnpnn', 'ppoonnnnnnnnpqpn', 'qpnonnnnoonnnppn', 'nnnnnnnooonnnnnn',
]
PALETTE = dict(a='60814b', b='769a54', c='86a95b', d='9ab769',
               n='916b51', m='7c5948', o='9e795a', p='866752', q='b39371', e='657448')
# The cap has one connected silhouette. A thin olive fringe belongs to both
# palettes; exposed earth below it uses the very same drawing as the dirt tile.
DEPTH = [4, 3, 3, 4, 5, 4, 3, 2, 3, 4, 4, 5, 6, 4, 3, 4]
SIDE = [''.join(GRASS[y][x] if y < DEPTH[x] - 1 else 'e' if y == DEPTH[x] - 1 else SOIL[y][x]
                for x in range(16)) for y in range(16)]

def paint(name, rows):
    assert len(rows) == 16 and all(len(r) == 16 for r in rows)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    pixels = b''.join(b'\0' + b''.join(bytes.fromhex(PALETTE[c]) for c in row) for row in rows)
    (OUT / f'{name}.png').write_bytes(b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 2, 0, 0, 0)) +
        chunk(b'IDAT', zlib.compress(pixels, 9)) + chunk(b'IEND', b''))

paint('meadow', GRASS)
paint('meadow-side', SIDE)
paint('earth', SOIL)
