import pg from "pg";
export const pgPool = new pg.Pool({
  connectionString: process.env.PG_URL ?? "postgres://ims:ims@localhost:5432/ims",
  max: 20,
});
