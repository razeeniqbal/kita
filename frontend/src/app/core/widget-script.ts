export type WidgetStyle = 'overview' | 'countdown' | 'tasks' | 'budget';

/** The styles offered in Settings. The name is what goes in Scriptable's widget Parameter. */
export const WIDGET_STYLES: { style: WidgetStyle; label: string; hint: string }[] = [
  { style: 'overview', label: 'Overview', hint: 'Countdown, with your next tasks beside it on the wide size' },
  { style: 'countdown', label: 'Countdown', hint: 'Big number of days to go' },
  { style: 'tasks', label: 'Tasks', hint: 'Your next tasks due' },
  { style: 'budget', label: 'Budget', hint: 'What is left to pay' },
];

/**
 * The Scriptable (iPhone) widget, with this person's read-only key filled in. One script serves
 * every style: each widget picks one with its Parameter (blank means overview). Tapping opens kita.
 * Keep the layouts in step with the previews in shared/widget-preview.ts.
 */
export function widgetScript(key: string, site: string): string {
  return `// kita. Home Screen widget for Scriptable. This key only reads your summary; keep it private.
// Widget Parameter picks the style: overview, countdown, tasks or budget.
const KEY = ${JSON.stringify(key)};
const SITE = ${JSON.stringify(site)};

const STYLE = String(args.widgetParameter || "overview").trim().toLowerCase();
const SIZE = config.widgetFamily || "medium";
const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
// Each mode keeps its own accent, as in the app: rose for Tunang, sage for Perkahwinan.
const THEMES = {
  TUNANG: { top: dyn("#F5E6E2", "#36221F"), bottom: dyn("#FBF8F5", "#141010"), accent: dyn("#9E6B63", "#E2B3AB"), bar: "#B68D86" },
  PERKAHWINAN: { top: dyn("#E5ECE2", "#1F2A1F"), bottom: dyn("#F9FAF6", "#101310"), accent: dyn("#5E6E57", "#B7C8B0"), bar: "#8D9A8A" },
};
const ink = dyn("#1D1D1F", "#F5F3EF");
const soft = dyn("#6E6A66", "#A8A29C");
const late = dyn("#C43D3D", "#FF7A70");

function text(stack, value, size, color, weight) {
  const t = stack.addText(value);
  t.font = weight === "big" ? Font.heavyRoundedSystemFont(size) : weight === "bold" ? Font.boldRoundedSystemFont(size)
    : Font.mediumSystemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}
function symbol(stack, name, size, color) {
  const img = stack.addImage(SFSymbol.named(name).image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
}
function column(parent) {
  const s = parent.addStack();
  s.layoutVertically();
  return s;
}
function bar(stack, percent, width, theme) {
  const h = 6;
  const ctx = new DrawContext();
  ctx.size = new Size(width, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, width, h), h / 2, h / 2);
  ctx.addPath(track);
  ctx.setFillColor(new Color(theme.bar, 0.25));
  ctx.fillPath();
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, 0, Math.max(h, (width * Math.min(percent, 100)) / 100), h), h / 2, h / 2);
  ctx.addPath(fill);
  ctx.setFillColor(new Color(theme.bar));
  ctx.fillPath();
  stack.addImage(ctx.getImage()).imageSize = new Size(width, h);
}
const rm = sen => "RM " + Math.round(sen / 100).toLocaleString("en-MY");

function header(e, theme) {
  const row = w.addStack();
  row.centerAlignContent();
  symbol(row, "heart.fill", 11, theme.accent);
  row.addSpacer(4);
  text(row, "kita.", 13, theme.accent, "bold");
  row.addSpacer();
  if (e) text(row, e.label, 11, soft);
  w.addSpacer(6);
}
function countdown(stack, e, theme, big, width) {
  text(stack, e.name, 12, soft);
  if (e.days === null) return text(stack, "Date not set", 20, ink, "bold");
  const row = stack.addStack();
  row.bottomAlignContent();
  text(row, e.days === 0 ? "Today!" : String(e.days), big ? 50 : 40, ink, "big");
  row.addSpacer(4);
  if (e.days) text(column(row), e.days === 1 ? "day\\nto go" : "days\\nto go", 11, soft).lineLimit = 2;
  stack.addSpacer(6);
  bar(stack, e.percent, width, theme);
  stack.addSpacer(3);
  text(stack, e.percent + "% of tasks done", 10, soft);
}
function taskList(stack, tasks, count, theme) {
  text(stack, "Next up", 12, soft);
  stack.addSpacer(4);
  if (!tasks.length) return text(stack, "Nothing due. Nice.", 13, ink, "bold");
  for (const t of tasks.slice(0, count)) {
    const row = stack.addStack();
    row.centerAlignContent();
    symbol(row, t.overdue ? "exclamationmark.circle.fill" : "circle", 11, t.overdue ? late : theme.accent);
    row.addSpacer(5);
    text(row, t.title, 12, t.overdue ? late : ink);
    stack.addSpacer(3);
  }
}
function budget(stack, e, theme, width) {
  text(stack, "Left to pay", 12, soft);
  text(stack, rm(e.left_to_pay_sen), SIZE === "small" ? 26 : 34, ink, "big");
  stack.addSpacer(6);
  bar(stack, e.cost_sen ? (100 * e.paid_sen) / e.cost_sen : 0, width, theme);
  stack.addSpacer(3);
  text(stack, rm(e.paid_sen) + " of " + rm(e.cost_sen) + " paid", 10, soft);
}

let data = null;
let problem = "";
try {
  const req = new Request(SITE + "/api/v1/widget/summary");
  req.headers = { "X-Widget-Key": KEY };
  const body = await req.loadJSON();
  if (req.response.statusCode === 200) data = body;
  else problem = body.detail || "Couldn't load kita.";
} catch (e) {
  problem = "No connection right now.";
}

const e = data && (data.events.find(x => x.days !== null && x.days >= 0) || data.events[0]);
const theme = THEMES[e ? e.mode : "TUNANG"] || THEMES.TUNANG;
const w = new ListWidget();
const g = new LinearGradient();
g.locations = [0, 1];
g.colors = [theme.top, theme.bottom];
w.backgroundGradient = g;
w.url = SITE;
w.setPadding(14, 16, 14, 16);
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

header(e, theme);
const full = SIZE === "small" ? 126 : 296;
if (!data || !e) {
  text(w, problem || "Nothing planned yet.", 12, soft);
} else if (STYLE === "countdown") {
  countdown(w, e, theme, SIZE !== "small", full);
} else if (STYLE === "tasks") {
  taskList(w, data.tasks, SIZE === "small" ? 3 : SIZE === "medium" ? 4 : 8, theme);
} else if (STYLE === "budget") {
  budget(w, e, theme, full);
} else if (SIZE === "small") {
  countdown(w, e, theme, false, full);
} else {
  const row = w.addStack();
  countdown(column(row), e, theme, false, 120);
  row.addSpacer(18);
  taskList(column(row), data.tasks, SIZE === "large" ? 8 : 4, theme);
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
