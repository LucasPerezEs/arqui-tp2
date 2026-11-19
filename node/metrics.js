import StatsD from "hot-shots";

export const metrics = new StatsD({
  host: process.env.DD_AGENT_HOST || "127.0.0.1",
  port: Number(process.env.DD_DOGSTATSD_PORT || 8125),
  protocol: "udp",
  prefix: "arvault.",
  globalTags: ["service:arvault", `env:${process.env.DD_ENV || "local"}`],
  errorHandler: error => {
    console.error("Error enviando metricas a DogStatsD:", error.code || error.message);
  },
});

export function recordExchangeResult(request, result) {
  metrics.increment("business.exchanges", 1, [
    `outcome:${result.ok ? "approved" : "not_approved"}`,
  ]);

  if (!result.ok) return;

  const baseAmount = Number(request.baseAmount);
  metrics.increment(`business.volume.${request.baseCurrency}`, baseAmount);
  metrics.increment(`business.volume.${request.counterCurrency}`, result.counterAmount);
  metrics.increment(`business.net.${request.baseCurrency}`, baseAmount);
  metrics.decrement(`business.net.${request.counterCurrency}`, result.counterAmount);
}
