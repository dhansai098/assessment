import { InfluxDB, Point } from "@influxdata/influxdb-client";
const client = new InfluxDB({
  url: process.env.INFLUX_URL ?? "http://localhost:8086",
  token: process.env.INFLUX_TOKEN ?? "",
});
const writer = client.getWriteApi(
  process.env.INFLUX_ORG ?? "ims",
  process.env.INFLUX_BUCKET ?? "signals",
  "ms",
);

export function writeMetric(componentId: string) {
  writer.writePoint(new Point("signal").tag("component", componentId).intField("count", 1));
}
setInterval(() => writer.flush().catch(() => {}), 2000);
