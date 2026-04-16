import cron, { type ScheduledTask } from "node-cron";

import { env } from "../config/env";
import { processPglAuditRetryBatch } from "../lib/pgl/service";
import { setWorkerStatus } from "../routes/system";

let retryTask: ScheduledTask | null = null;
let running = false;

export async function runPglAuditRetryCycle() {
  if (running) return;
  running = true;
  const startedAt = new Date();

  try {
    const result = await processPglAuditRetryBatch();
    setWorkerStatus("pglAuditRetry", {
      running: true,
      lastRun: startedAt.toISOString(),
      nextRun: null,
    });
    if (result.processed > 0) {
      console.log("PGL audit retry cycle:", result);
    }
  } catch (error) {
    console.error("PGL audit retry cycle failed:", error);
    setWorkerStatus("pglAuditRetry", {
      running: false,
      lastRun: startedAt.toISOString(),
      nextRun: null,
    });
  } finally {
    running = false;
  }
}

export function startPglAuditRetryWorker() {
  if (!env.PGL_AUDIT_RETRY_ENABLED) {
    console.log("PGL audit retry worker disabled");
    setWorkerStatus("pglAuditRetry", {
      running: false,
      lastRun: null,
      nextRun: null,
    });
    return;
  }

  if (retryTask) return;

  setWorkerStatus("pglAuditRetry", {
    running: true,
    lastRun: null,
    nextRun: null,
  });

  retryTask = cron.schedule(env.PGL_AUDIT_RETRY_CRON, () => {
    runPglAuditRetryCycle().catch((error) => {
      console.error("PGL audit retry cron failed:", error);
    });
  });

  runPglAuditRetryCycle().catch((error) => {
    console.error("PGL audit retry initial run failed:", error);
  });

  console.log(`PGL audit retry worker scheduled (${env.PGL_AUDIT_RETRY_CRON})`);
}

export function stopPglAuditRetryWorker() {
  if (retryTask) {
    retryTask.stop();
    retryTask = null;
  }

  setWorkerStatus("pglAuditRetry", {
    running: false,
  });
}
