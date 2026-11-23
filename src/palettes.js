// Palettes: page background, cube body, six tile colours and the UI tokens.
// faces order: +x (right), -x (left), +y (top), -y (bottom), +z (front), -z (back)
// Choose one in public/site.json -> "palette". Try any of them with ?palette=<name>.
export const PALETTES = {
  ink: {
    dark: true,
    bg: '#000000', body: '#0B0C11', aura: 0.15,
    faces: ['#FF4D8D', '#FF9F43', '#E4EAFF', '#A8F03C', '#2EC5FF', '#8B6CFF'],
    ui: { fg: '#EEF0FF', dim: '#7E8499', line: '#16171D', acc: '#2EC5FF', accInk: '#000000' },
  },
  classic: {
    dark: true,
    bg: '#000000', body: '#0E0E10', aura: 0.16,
    faces: ['#D9262C', '#FF7A1A', '#EDEBE6', '#FFD21F', '#13A85A', '#1F5BE0'],
    ui: { fg: '#F2F0EC', dim: '#85827D', line: '#1A1A1A', acc: '#FFD21F', accInk: '#000000' },
  },
  soft: {
    dark: true,
    bg: '#0B0B0D', body: '#1C1D22', aura: 0.14,
    faces: ['#FF8F84', '#FFBE7A', '#F4F0E6', '#FFE58F', '#93DDB0', '#94B6FF'],
    ui: { fg: '#F4F0E6', dim: '#8D8B86', line: '#1F2025', acc: '#94B6FF', accInk: '#0B0B0D' },
  },
  paper: {
    dark: false,
    bg: '#E8E4DC', body: '#151515', aura: 0,
    faces: ['#D4462F', '#EE8A35', '#FBF8F2', '#F1C232', '#2F8C5A', '#2D5BC6'],
    ui: { fg: '#151515', dim: '#6E6961', line: '#D2CCC1', acc: '#151515', accInk: '#F4F1EA' },
  },
};

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export function getPalette(name) {
  return PALETTES[name] ? { name, ...PALETTES[name] } : { name: 'ink', ...PALETTES.ink };
}

// page colours follow the palette
export function applyPalette(p) {
  const r = document.documentElement.style;
  r.setProperty('--bg', p.bg);
  r.setProperty('--fg', p.ui.fg);
  r.setProperty('--dim', p.ui.dim);
  r.setProperty('--line', p.ui.line);
  r.setProperty('--acc', p.ui.acc);
  r.setProperty('--acc-ink', p.ui.accInk);
  r.setProperty('--fg-28', rgba(p.ui.fg, 0.28));
  r.setProperty('--panel', rgba(p.bg, 0.9));
  document.documentElement.dataset.palette = p.name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
}
