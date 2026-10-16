/** Run the daily price job once from the command line (same as the cron route). */
import { runPriceJob } from "@/server/prices/job";

runPriceJob()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
