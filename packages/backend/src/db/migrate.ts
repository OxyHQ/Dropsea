/**
 * Apply the SQL migrations in `packages/backend/drizzle/` to `DATABASE_URL`,
 * through `@oxy.so/db/migrate`, the migrator create-oxy-app scaffolds.
 *
 *     bun run db:migrate --target-database=dropsea_dev [--phase=pre|post|all]
 *
 * `--target-database` is REQUIRED: pointed at the wrong database a migrator
 * finds an empty ledger, applies the whole journal and exits 0 while the real
 * database stays untouched. Every `.sql` file carries `-- oxy:deploy-phase=pre`
 * (additive, applied before the rollout) or `post` (takes something away,
 * applied after it); an unmarked one fails before any DDL runs. `DRY_RUN=true`
 * reports what would be applied and writes nothing.
 */

import {
  MIGRATION_RUNS,
  type MigrationRun,
  readTargetDatabase,
  runMigrations,
} from '@oxy.so/db/migrate';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MIGRATIONS_FOLDER } from './migrationsFolder';

function isDryRun(): boolean {
  const value = (process.env.DRY_RUN ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/**
 * `--phase=<pre|post|all>`, default `all` (a developer's own database has no
 * previous image to protect). An unrecognised value throws rather than
 * falling back to `all`.
 */
function readPhase(argv: readonly string[]): MigrationRun {
  const prefix = '--phase=';
  const flag = argv.find((arg) => arg.startsWith(prefix));
  if (!flag) return 'all';
  const value = flag.slice(prefix.length).trim();
  const run = MIGRATION_RUNS.find((candidate) => candidate === value);
  if (!run) {
    throw new Error(
      `Unrecognised --phase=${JSON.stringify(value)}. Use one of: ${MIGRATION_RUNS.join(', ')}.`,
    );
  }
  return run;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDatabase = readTargetDatabase(argv);
  const run = readPhase(argv);
  await runMigrations({
    databaseUrl: config.databaseUrl,
    migrationsFolder: MIGRATIONS_FOLDER,
    extensions: [],
    run,
    expectedDatabase,
    dryRun: isDryRun(),
    logger,
  });
}

main().catch((error: unknown) => {
  logger.error('Postgres migration failed', error);
  process.exitCode = 1;
});
