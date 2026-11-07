/**
 * The Scriptable (iPhone) widget, with this person's read-only key filled in. Small widgets show the
 * next milestone's countdown; medium and large ones add the next tasks due. Tapping opens kita.
 */
export function widgetScript(key: string, site: string): string {
  return `// kita. Home Screen widget for Scriptable. This key only reads your summary; keep it private.
const KEY = ${JSON.stringify(key)};
const SITE = ${JSON.stringify(site)};

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

function line(text, size, color, bold) {
  const t = w.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
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

line("kita.", 13, accent, true);
w.addSpacer(4);
if (!data) {
  line(problem, 12, soft);
} else {
  const next = data.events.find(e => e.days !== null && e.days >= 0) || data.events[0];
  if (next) {
    line(next.label + " · " + next.name, 12, soft);
    const days = next.days === null ? "Date not set" : next.days === 0 ? "Today!" : next.days + (next.days === 1 ? " day" : " days") + " to go";
    line(days, 22, ink, true);
    const toPay = next.left_to_pay_sen ? " · RM " + Math.round(next.left_to_pay_sen / 100).toLocaleString("en-MY") + " to pay" : "";
    line(next.percent + "% done" + toPay, 12, soft);
  }
  if (config.widgetFamily !== "small") {
    w.addSpacer(8);
    if (!data.tasks.length) line("Nothing due. Nice.", 12, soft);
    for (const t of data.tasks) line((t.overdue ? "! " : "• ") + t.title, 12, t.overdue ? late : ink);
  }
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
