import { mkdir, open } from "node:fs/promises";
import path from "node:path";

const dataRoot = path.resolve(process.cwd(), process.env.R6_DATA_DIR || "data");
await mkdir(dataRoot, { recursive: true });
const database = await open(path.join(dataRoot, "r6-creator.db"), "a");
await database.close();

console.log(`Local data folder ready: ${dataRoot}`);
