// Generates the placeholder SVG art (monster moods, gate, doors, gift) into client/public/assets/art/.
// Artists can replace any file with their own art of the same name (PNG works too — update the loader in MonsterScene).
// Usage: npm run art
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '..', 'client', 'public', 'assets', 'art');
mkdirSync(out, { recursive: true });

const FUR = '#4f8a6e';
const FUR_DARK = '#2f5a47';
const FUR_LIGHT = '#78b394';
const INK = '#1b2f27';
const BONE = '#efe3c4';
const BONE_DARK = '#b9a77d';
const MOUTH = '#4a1620';

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${body}</svg>\n`;

/** Ellipse outline made of outward bumps — reads as fur. */
function furryEllipse(cx: number, cy: number, rx: number, ry: number, bumps: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i <= bumps; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i % bumps]!;
    const r = (Math.hypot(x1 - x0, y1 - y0) * 0.62).toFixed(1);
    d += ` A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return `${d} Z`;
}

const mirrorX = (d: string, w: number) =>
  d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${(w - Number(x)).toFixed(1)} ${y}`);

type Mood = 'angry' | 'annoyed' | 'neutral' | 'amused' | 'impressed';
const EYES: [number, number][] = [[135, 172], [225, 172]];

function eyes(mood: Mood): string {
  if (mood === 'amused') {
    // Happy closed eyes ^ ^
    return EYES.map(([x, y]) => `<path d="M ${x - 28} ${y + 8} Q ${x} ${y - 30} ${x + 28} ${y + 8}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`).join('');
  }
  const r = mood === 'impressed' ? 38 : 33;
  const pr = mood === 'angry' ? 9 : mood === 'impressed' ? 19 : 14;
  const dy = mood === 'annoyed' ? 10 : mood === 'impressed' ? -2 : 2;
  const dx = mood === 'annoyed' ? 8 : 0;
  let s = '';
  for (const [x, y] of EYES) {
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="5"/>`;
    s += `<circle cx="${x + dx}" cy="${y + dy}" r="${pr}" fill="${INK}"/>`;
    s += `<circle cx="${x + dx - pr * 0.35}" cy="${y + dy - pr * 0.4}" r="${Math.max(3, pr * 0.32)}" fill="#fff"/>`;
    if (mood === 'impressed') s += `<circle cx="${x + 7}" cy="${y + 7}" r="3.5" fill="#fff"/>`;
    if (mood === 'annoyed') {
      // Heavy half-closed lid
      s += `<path d="M ${x - r - 3} ${y - 2} A ${r + 3} ${r + 3} 0 0 1 ${x + r + 3} ${y - 2} Z" fill="${FUR}"/>`;
      s += `<path d="M ${x - r - 2} ${y - 2} L ${x + r + 2} ${y - 2}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    }
  }
  return s;
}

function brows(mood: Mood): string {
  const paths: Record<Mood, [string, string]> = {
    angry: ['M 98 118 L 162 146', 'M 198 146 L 262 118'],
    annoyed: ['M 100 140 L 165 136', 'M 195 136 L 260 140'],
    neutral: ['M 102 126 Q 132 118 162 128', 'M 198 128 Q 228 118 258 126'],
    amused: ['M 104 128 Q 134 112 162 124', 'M 198 124 Q 226 112 256 128'],
    impressed: ['M 100 112 Q 134 88 166 108', 'M 194 108 Q 226 88 260 112'],
  };
  return paths[mood].map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`).join('');
}

const fangs = (y: number) =>
  `<path d="M 158 ${y} L 165 ${y + 16} L 172 ${y} Z M 188 ${y} L 195 ${y + 16} L 202 ${y} Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;

function mouth(mood: Mood): string {
  switch (mood) {
    case 'angry':
      return `<path d="M 136 248 Q 180 226 224 248 L 222 272 Q 180 258 138 272 Z" fill="${MOUTH}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M 142 247 L 150 258 L 158 242 L 166 255 L 174 239 L 182 254 L 190 239 L 198 255 L 206 242 L 214 258 L 220 247 Z" fill="#fff"/>`;
    case 'annoyed':
      return `<path d="M 146 254 Q 158 244 170 254 Q 182 264 194 254 Q 206 244 216 254" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>${fangs(258)}`;
    case 'neutral':
      return `<path d="M 146 252 Q 180 244 214 252" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>${fangs(251)}`;
    case 'amused':
      return `<path d="M 134 236 Q 180 300 226 236 Q 180 254 134 236 Z" fill="${MOUTH}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M 162 268 Q 180 256 198 268 Q 180 282 162 268 Z" fill="#e86a7a"/>${fangs(240)}`;
    case 'impressed':
      return `<ellipse cx="180" cy="262" rx="24" ry="28" fill="${MOUTH}" stroke="${INK}" stroke-width="5"/>
        <ellipse cx="180" cy="276" rx="13" ry="9" fill="#e86a7a"/>`;
  }
}

const sparkle = (x: number, y: number, s: number, color = '#ffd84a') =>
  `<path d="M ${x} ${y - s} Q ${x + s * 0.15} ${y - s * 0.15} ${x + s} ${y} Q ${x + s * 0.15} ${y + s * 0.15} ${x} ${y + s} Q ${x - s * 0.15} ${y + s * 0.15} ${x - s} ${y} Q ${x - s * 0.15} ${y - s * 0.15} ${x} ${y - s} Z" fill="${color}"/>`;

function extras(mood: Mood): string {
  const blush = `<ellipse cx="102" cy="222" rx="20" ry="11" fill="#ff7f9a" opacity=".55"/><ellipse cx="258" cy="222" rx="20" ry="11" fill="#ff7f9a" opacity=".55"/>`;
  switch (mood) {
    case 'angry':
      return `<g fill="#fff" opacity=".8"><circle cx="58" cy="52" r="13"/><circle cx="44" cy="40" r="9"/><circle cx="70" cy="38" r="8"/>
        <circle cx="304" cy="48" r="13"/><circle cx="318" cy="36" r="9"/><circle cx="292" cy="34" r="8"/></g>`;
    case 'amused':
      return blush;
    case 'impressed':
      return blush + sparkle(48, 110, 16) + sparkle(318, 70, 20) + sparkle(334, 160, 11) + sparkle(30, 190, 10);
    default:
      return '';
  }
}

/** Turkish tulip tea glass: flared rim, narrow waist, round belly; red-amber tea; saucer with a red rim and a teaspoon. */
function teaGlass(cx: number, steam: boolean): string {
  const top = 222;
  const bottom = 284;
  // Right half of the silhouette (x offsets from cx), mirrored for the left half.
  const right = `L ${cx + 10} ${bottom} C ${cx + 13} ${bottom - 1} ${cx + 16} ${bottom - 5} ${cx + 16} ${bottom - 14}
    C ${cx + 16} ${bottom - 24} ${cx + 12} ${bottom - 30} ${cx + 12} ${top + 22} C ${cx + 12} ${top + 14} ${cx + 18} ${top + 7} ${cx + 19} ${top}`;
  const glass = `M ${cx - 19} ${top} C ${cx - 18} ${top + 7} ${cx - 12} ${top + 14} ${cx - 12} ${top + 22}
    C ${cx - 12} ${bottom - 30} ${cx - 16} ${bottom - 24} ${cx - 16} ${bottom - 14} C ${cx - 16} ${bottom - 5} ${cx - 13} ${bottom - 1} ${cx - 10} ${bottom}
    ${right} Z`;
  return `
  <defs>
    <clipPath id="glass"><path d="${glass}"/></clipPath>
    <linearGradient id="tea" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7a1606"/><stop offset=".45" stop-color="#c8401a"/><stop offset="1" stop-color="#8e1f08"/>
    </linearGradient>
  </defs>
  <!-- saucer -->
  <ellipse cx="${cx}" cy="${bottom + 4}" rx="29" ry="7" fill="#f4f6f6" stroke="#b9c2c1" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${bottom + 3}" rx="23" ry="4.5" fill="none" stroke="#c0392b" stroke-width="2"/>
  <!-- teaspoon resting on the saucer -->
  <path d="M ${cx + 13} ${bottom + 4} L ${cx + 30} ${bottom - 4}" stroke="#c9ced3" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="${cx + 10}" cy="${bottom + 5}" rx="5" ry="2.5" fill="#c9ced3"/>
  <!-- glass with tea -->
  <g clip-path="url(#glass)">
    <rect x="${cx - 21}" y="${top}" width="42" height="${bottom - top}" fill="#ffffff" opacity=".28"/>
    <rect x="${cx - 21}" y="${top + 8}" width="42" height="${bottom - top}" fill="url(#tea)"/>
    <ellipse cx="${cx}" cy="${top + 8}" rx="14" ry="2.5" fill="#e0662f"/>
    <path d="M ${cx - 9} ${top + 24} C ${cx - 13} ${bottom - 20} ${cx - 13} ${bottom - 10} ${cx - 9} ${bottom - 4}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>
  </g>
  <path d="${glass}" fill="none" stroke="#dfe7e6" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="${cx}" cy="${top}" rx="19" ry="3" fill="#ffffff" fill-opacity=".25" stroke="#eef3f2" stroke-width="1.5"/>
  <!-- hand under the saucer -->
  <circle cx="${cx}" cy="${bottom + 18}" r="15" fill="${FUR_DARK}"/>
  ${steam ? `<path d="M ${cx - 5} ${top - 6} Q ${cx - 11} ${top - 20} ${cx - 3} ${top - 30} M ${cx + 7} ${top - 6} Q ${cx + 13} ${top - 22} ${cx + 5} ${top - 34}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>` : ''}`;
}

function monster(mood: Mood): string {
  const W = 360;
  const leftHorn = 'M 112 118 Q 66 76 80 14 Q 104 66 146 96 Z';
  const rightHornBent = 'M 246 104 Q 300 70 324 104 Q 336 128 318 146 Q 312 118 284 126 Z';
  const vestLeft = 'M 50 296 Q 68 266 122 258 L 168 320 L 168 388 Q 108 394 70 364 Q 46 334 50 296 Z';
  return svg(W, 420, `
  <defs>
    <radialGradient id="fur" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="${FUR_LIGHT}"/><stop offset="1" stop-color="${FUR}"/></radialGradient>
  </defs>
  <!-- horns -->
  <path d="${leftHorn}" fill="${BONE}" stroke="${BONE_DARK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="${rightHornBent}" fill="${BONE}" stroke="${BONE_DARK}" stroke-width="5" stroke-linejoin="round"/>
  <!-- feet -->
  <ellipse cx="118" cy="394" rx="42" ry="20" fill="${FUR_DARK}"/><ellipse cx="242" cy="394" rx="42" ry="20" fill="${FUR_DARK}"/>
  <g fill="${BONE}"><circle cx="94" cy="404" r="6"/><circle cx="112" cy="408" r="6"/><circle cx="130" cy="406" r="6"/>
  <circle cx="230" cy="406" r="6"/><circle cx="248" cy="408" r="6"/><circle cx="266" cy="404" r="6"/></g>
  <!-- left arm (resting) -->
  <ellipse cx="40" cy="300" rx="24" ry="52" transform="rotate(14 40 300)" fill="${FUR_DARK}"/>
  <!-- body -->
  <path d="${furryEllipse(180, 236, 140, 160, 30)}" fill="url(#fur)" stroke="${FUR_DARK}" stroke-width="5" stroke-linejoin="round"/>
  <ellipse cx="180" cy="320" rx="78" ry="72" fill="#a6d8b8"/>
  <!-- kapıcı vest -->
  <path d="${vestLeft}" fill="#8a5a32" stroke="#5b3a1f" stroke-width="5" stroke-linejoin="round"/>
  <path d="${mirrorX(vestLeft, W)}" fill="#8a5a32" stroke="#5b3a1f" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="158" cy="342" r="7" fill="#f2c14e" stroke="#9c7420" stroke-width="2"/><circle cx="158" cy="368" r="7" fill="#f2c14e" stroke="#9c7420" stroke-width="2"/>
  <!-- face -->
  ${extras(mood)}
  ${eyes(mood)}
  ${brows(mood)}
  ${mouth(mood)}
  <!-- right arm holding a Turkish tea glass (ince belli) on its saucer -->
  <ellipse cx="318" cy="292" rx="22" ry="44" transform="rotate(-20 318 292)" fill="${FUR_DARK}"/>
  ${teaGlass(327, mood === 'neutral' || mood === 'amused')}
  `);
}

for (const mood of ['angry', 'annoyed', 'neutral', 'amused', 'impressed'] as const) {
  writeFileSync(resolve(out, `monster_${mood}.svg`), monster(mood));
}

// ---- gate ---------------------------------------------------------------------

const outer = 'M 0 600 L 0 210 Q 0 0 260 0 Q 520 0 520 210 L 520 600 Z';
const inner = 'M 70 600 L 70 230 Q 70 70 260 70 Q 450 70 450 230 L 450 600 Z';
let stones = '';
for (let y = 260; y < 600; y += 56) {
  const off = (y / 56) % 2 ? 0 : 18;
  stones += `<path d="M 0 ${y} L 70 ${y} M 450 ${y} L 520 ${y} M ${22 + off} ${y} L ${22 + off} ${y + 56} M ${470 + off / 2} ${y} L ${470 + off / 2} ${y + 56}" stroke="#4b4e5c" stroke-width="4"/>`;
}
writeFileSync(
  resolve(out, 'gate.svg'),
  svg(520, 600, `
  <defs><linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b8fa3"/><stop offset="1" stop-color="#5f6375"/></linearGradient></defs>
  <path d="${outer} ${inner}" fill="url(#stone)" fill-rule="evenodd" stroke="#3a3c48" stroke-width="6"/>
  ${stones}
  <path d="M 70 230 Q 70 70 260 70 Q 450 70 450 230" fill="none" stroke="#3a3c48" stroke-width="10"/>
  <path d="M 222 -2 L 298 -2 L 286 78 L 234 78 Z" fill="#767a8e" stroke="#3a3c48" stroke-width="5" stroke-linejoin="round"/>
  ${sparkle(260, 36, 18, '#ffd84a')}
  `),
);

function door(mirrored: boolean): string {
  const W = 190;
  let shape = 'M 0 530 L 0 160 Q 0 0 190 0 L 190 530 Z';
  let planks = '';
  for (let x = 38; x < W; x += 38) planks += `<path d="M ${x} 0 L ${x} 530" stroke="#5a3418" stroke-width="4"/>`;
  let bands = '';
  for (const y of [190, 340, 470]) {
    bands += `<rect x="0" y="${y}" width="${W}" height="22" fill="#3a3a44"/>`;
    for (let x = 14; x < W; x += 34) bands += `<circle cx="${x}" cy="${y + 11}" r="4.5" fill="#8d8d9c"/>`;
  }
  let ring = '';
  if (mirrored) {
    shape = mirrorX(shape, W);
    ring = `<circle cx="26" cy="300" r="20" fill="none" stroke="#d1a43c" stroke-width="7"/><rect x="14" y="250" width="24" height="34" rx="4" fill="#d1a43c" stroke="#7a5a14" stroke-width="3"/><circle cx="26" cy="264" r="5" fill="#2a1a08"/>`;
  }
  return svg(W, 530, `
  <defs><clipPath id="c"><path d="${shape}"/></clipPath>
  <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5530"/><stop offset="1" stop-color="#6e4122"/></linearGradient></defs>
  <g clip-path="url(#c)"><rect width="${W}" height="530" fill="url(#wood)"/>${planks}${bands}</g>
  <path d="${shape}" fill="none" stroke="#2b1a0c" stroke-width="6"/>
  ${ring}`);
}
writeFileSync(resolve(out, 'door_left.svg'), door(false));
writeFileSync(resolve(out, 'door_right.svg'), door(true));

writeFileSync(
  resolve(out, 'gift.svg'),
  svg(160, 150, `
  <rect x="18" y="62" width="124" height="84" rx="6" fill="#e04f5f" stroke="#8e2433" stroke-width="5"/>
  <rect x="8" y="44" width="144" height="28" rx="6" fill="#f06676" stroke="#8e2433" stroke-width="5"/>
  <rect x="68" y="44" width="24" height="102" fill="#ffd84a" stroke="#b08a10" stroke-width="3"/>
  <path d="M 80 44 Q 40 0 30 30 Q 26 50 80 44 Z M 80 44 Q 120 0 130 30 Q 134 50 80 44 Z" fill="#ffd84a" stroke="#b08a10" stroke-width="4"/>
  `),
);

console.log(`art written to ${out}`);
