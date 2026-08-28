import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.DATABASE_URL?.trim() ||
  "mysql://drizzle:drizzle@localhost:3306/drizzle";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
