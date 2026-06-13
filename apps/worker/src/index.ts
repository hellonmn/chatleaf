import "dotenv/config";
import {
  Worker,
  createRedisConnection,
  WA_INBOUND_QUEUE,
  type Job,
  type WaInboundJob,
  type ConnectionOptions,
} from "@watool/queue";
import { processInboundJob } from "@watool/processing";
import { initSentry, captureError, logger } from "@watool/observability";

function requireEnv(name: string): void {
  if (!process.env[name]) {
    console.error(`[worker] missing required env: ${name}`);
    process.exit(1);
  }
}

requireEnv("DATABASE_URL");
requireEnv("REDIS_URL");
requireEnv("ENCRYPTION_KEY");

void initSentry();

const connection = createRedisConnection();

const worker = new Worker<WaInboundJob>(
  WA_INBOUND_QUEUE,
  async (job: Job<WaInboundJob>) => {
    console.log(`[worker] processing job ${job.id} (event ${job.data.webhookEventId})`);
    await processInboundJob(job.data);
  },
  { connection: connection as unknown as ConnectionOptions, concurrency: 5 },
);

worker.on("completed", (job) => logger.info("job done", { jobId: job.id }));
worker.on("failed", (job, err) =>
  captureError(err, { scope: "worker.job", jobId: job?.id }),
);

console.log(`[worker] listening on "${WA_INBOUND_QUEUE}" …`);

// Graceful shutdown so in-flight jobs aren't lost.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[worker] ${sig} received, closing…`);
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}
