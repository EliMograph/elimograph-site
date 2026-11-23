// Adds a finished video to the site: web copy, poster, short silent preview, and a line in works.json.
//   npm run add-work -- "../clients/acme/renders/acme_launch_9x16_v2.mp4" --title "Acme" --client "Acme Inc." --type "Launch video"
// Options: --title (required) --client --type --slug --start <sec for preview, default 1> --dir <site folder, default public>
// Needs ffmpeg + ffprobe on PATH.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const src = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!src || !opt('title')) {
  console.log('Usage: npm run add-work -- <video.mp4> --title "Name" [--client "Client"] [--type "Launch video"] [--start 1]');
  process.exit(1);
}
if (!fs.existsSync(src)) { console.error('No such file:', src); process.exit(1); }

const dir = path.resolve(opt('dir', 'public'));
const outDir = path.join(dir, 'works');
fs.mkdirSync(outDir, { recursive: true });
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'work';
let slug = opt('slug', slugify(opt('title')));
const listPath = path.join(dir, 'works.json');
const list = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8') || '[]') : [];
const taken = new Set(list.map((w) => path.basename(w.video || '', '.mp4')));
for (let n = 2, b = slug; taken.has(slug) || fs.existsSync(path.join(outDir, `${slug}.mp4`)); n++) slug = `${b}-${n}`;

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', src]).toString());
const { width: W, height: H } = probe.streams[0];
const dur = parseFloat(probe.format.duration) || 0;
const r = W / H;
const format = Math.abs(r - 9 / 16) < 0.05 ? '9:16' : Math.abs(r - 16 / 9) < 0.05 ? '16:9' : Math.abs(r - 1) < 0.05 ? '1:1' : `${W}×${H}`;
const hasAudio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', src]).toString().trim() !== '';
const run = (a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
const start = Math.min(parseFloat(opt('start', '1')), Math.max(0, dur - 4));
const short = (px) => (W < H ? `scale=${px}:-2` : `scale=-2:${px}`);

const video = `works/${slug}.mp4`, poster = `works/${slug}.jpg`, preview = `works/${slug}-preview.mp4`;
console.log(`→ ${video}  (${format}, ${dur.toFixed(1)} s)`);
run(['-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-vf', short(1080), '-movflags', '+faststart',
  ...(hasAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']), path.join(dir, video)]);
console.log(`→ ${poster}`);
run(['-ss', String(start), '-i', src, '-frames:v', '1', '-vf', short(720), '-q:v', '3', path.join(dir, poster)]);
console.log(`→ ${preview}  (4 s, silent)`);
run(['-ss', String(start), '-t', '4', '-i', src, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-vf', `${short(480)},fps=30`, '-movflags', '+faststart', path.join(dir, preview)]);

const entry = { title: opt('title'), client: opt('client', ''), type: opt('type', ''), format, video, poster, preview };
list.push(entry);
fs.writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');
console.log(`✓ Added to ${path.relative(process.cwd(), listPath)}:`, JSON.stringify(entry));
