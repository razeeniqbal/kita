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
const bg = Color.dynamic(new Color("#FAF9F6"), new Color("#121110"));
const ink = Color.dynamic(new Color("#1D1D1F"), new Color("#F5F3EF"));
const soft = Color.dynamic(new Color("#6E6A66"), new Color("#A8A29C"));
const accent = Color.dynamic(new Color("#B0706F"), new Color("#E3A9A6"));
const late = Color.dynamic(new Color("#C43D3D"), new Color("#FF7A70"));

const w = new ListWidget();
w.backgroundColor = bg;
w.url = SITE;
w.setPadding(14, 16, 14, 16);
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

function text(stack, value, size, color, bold) {
  const t = stack.addText(value);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
}
function column(parent) {
  const s = parent.addStack();
  s.layoutVertically();
  return s;
}
const rm = sen => "RM " + Math.round(sen / 100).toLocaleString("en-MY");

function countdown(stack, e, big) {
  text(stack, e.label + " · " + e.name, 11, soft);
  if (e.days === null) return text(stack, "Date not set", 18, ink, true);
  if (e.days === 0) return text(stack, "Today!", big ? 40 : 30, ink, true);
  text(stack, String(e.days), big ? 44 : 34, ink, true);
  text(stack, (e.days === 1 ? "day" : "days") + " to go · " + e.percent + "% done", 11, soft);
}
function taskList(stack, tasks, count) {
  text(stack, "Next up", 11, soft);
  stack.addSpacer(3);
  if (!tasks.length) return text(stack, "Nothing due. Nice.", 12, soft);
  for (const t of tasks.slice(0, count)) text(stack, (t.overdue ? "! " : "• ") + t.title, 12, t.overdue ? late : ink);
}
function budget(stack, e) {
  text(stack, e.label + " budget", 11, soft);
  text(stack, rm(e.left_to_pay_sen), SIZE === "small" ? 24 : 30, ink, true);
  text(stack, "left to pay", 11, soft);
  stack.addSpacer(4);
  text(stack, rm(e.paid_sen) + " paid of " + rm(e.cost_sen), 11, soft);
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

text(w, "kita.", 13, accent, true);
w.addSpacer(4);
const e = data && (data.events.find(x => x.days !== null && x.days >= 0) || data.events[0]);
if (!data || !e) {
  text(w, problem || "Nothing planned yet.", 12, soft);
} else if (STYLE === "countdown") {
  countdown(w, e, SIZE !== "small");
} else if (STYLE === "tasks") {
  taskList(w, data.tasks, SIZE === "small" ? 3 : SIZE === "medium" ? 4 : 8);
} else if (STYLE === "budget") {
  budget(w, e);
} else if (SIZE === "small") {
  countdown(w, e, false);
} else {
  const row = w.addStack();
  countdown(column(row), e, true);
  row.addSpacer(18);
  taskList(column(row), data.tasks, SIZE === "large" ? 8 : 4);
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
