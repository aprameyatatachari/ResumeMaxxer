import 'dotenv/config'

import { getMigrations } from 'better-auth/db/migration'

import { auth } from './auth'

/**
 * Creates and updates the Better Auth tables (user, session, account,
 * verification, jwks).
 *
 * This runs `getMigrations` from the *installed* better-auth package rather
 * than shelling out to `@better-auth/cli`. That is deliberate: the CLI is
 * versioned independently, and a CLI older than the library writes a schema
 * the library then fails against at runtime. For example, better-auth 1.7
 * scopes account identity by `issuer`, and an older CLI omits that column,
 * producing:
 *
 *     error: column "issuer" of relation "account" does not exist
 *
 * Importing the migration API from the library makes that mismatch impossible.
 *
 * Safe to run repeatedly - it only adds what is missing.
 */
async function main() {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options)

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log('Auth schema is already up to date.')
    return
  }

  for (const table of toBeCreated) {
    console.log(`create table ${table.table}: ${Object.keys(table.fields).join(', ')}`)
  }
  for (const table of toBeAdded) {
    console.log(`alter table ${table.table}: + ${Object.keys(table.fields).join(', ')}`)
  }

  await runMigrations()
  console.log('\nAuth schema migrated.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Auth migration failed:', error)
    process.exit(1)
  })
