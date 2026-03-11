/* eslint-disable */
/**
 * Generated data model stub.
 * Run `bunx convex dev` to regenerate.
 */
import type { DataModelFromSchemaDefinition } from "convex/server";
import schema from "../schema";
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type Id<TableName extends keyof DataModel & string> = string & { __tableName: TableName };
export type TableNames = keyof DataModel & string;
