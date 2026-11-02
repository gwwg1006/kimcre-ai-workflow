import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("jobs", {
  screenshot: text("screenshot").notNull().default(""),
  id: integer("id").primaryKey({ autoIncrement: true }),
  printer: text("printer").notNull(),
  modelName: text("model_name").notNull(),
  fileName: text("file_name").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  completedQuantity: integer("completed_quantity").notNull().default(0),
  material: text("material").notNull().default("PLA"),
  color: text("color").notNull().default("White"),
  nozzle: text("nozzle").notNull().default("0.4 mm"),
  estimatedTime: text("estimated_time").notNull().default(""),
  printSettings: text("print_settings").notNull().default("0.20 mm Standard"),
  customer: text("customer").notNull().default(""),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("waiting"),
  priority: text("priority").notNull().default("normal"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
