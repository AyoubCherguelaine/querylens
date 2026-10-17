export const demoQuestions = [
  {
    id: "regions",
    label: "Which region leads revenue?",
    metric: "Revenue",
    field: "region",
    sql: "SELECT region, SUM(revenue) AS revenue\nFROM demo.sales\nGROUP BY region\nORDER BY revenue DESC;",
  },
  {
    id: "trend",
    label: "How is revenue trending?",
    metric: "Revenue",
    field: "month",
    sql: "SELECT month, SUM(revenue) AS revenue\nFROM demo.sales\nGROUP BY month\nORDER BY array_position(\n  ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], month\n);",
  },
  {
    id: "channels",
    label: "Where do orders come from?",
    metric: "Orders",
    field: "channel",
    sql: "SELECT channel, SUM(orders) AS orders\nFROM demo.sales\nGROUP BY channel\nORDER BY orders DESC;",
  },
] as const;
export type DemoQuestion = (typeof demoQuestions)[number];

// A small, deterministic sample dataset. All demo totals come from these records.
export const demoSales = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].flatMap(
  (month, monthIndex) =>
    ["North America", "Europe", "Asia Pacific"].map((region, regionIndex) => ({
      month,
      region,
      channel: ["Online", "Retail", "Partners"][(monthIndex + regionIndex) % 3],
      revenue:
        [18400, 14200, 9600][regionIndex] +
        monthIndex * [2100, 1600, 1200][regionIndex],
      orders:
        [132, 108, 74][regionIndex] + monthIndex * [14, 11, 9][regionIndex],
    })),
);

export function demoResult(question: DemoQuestion) {
  const groups = new Map<string, number>();
  for (const row of demoSales) {
    const label = row[question.field];
    groups.set(
      label,
      (groups.get(label) || 0) +
        (question.id === "channels" ? row.orders : row.revenue),
    );
  }
  const rows = Array.from(groups, ([label, value]) => ({ label, value }));
  if (question.id !== "trend") rows.sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const summary =
    question.id === "trend"
      ? `Monthly revenue increased ${Math.round(((last.value - first.value) / first.value) * 100)}% from January to June across the sample dataset.`
      : `${first.label} accounts for ${Math.round((first.value / total) * 100)}% of ${question.id === "channels" ? "orders" : "revenue"} in the sample dataset.`;
  return { rows, total, summary };
}
