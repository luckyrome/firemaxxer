import { Pool, QueryResult, QueryResultRow, types } from 'pg';
import { config } from './env';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of Date objects.
types.setTypeParser(1082, (val: string) => val);

const pool = new Pool({ connectionString: config.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected pg pool error', err);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export { pool };
