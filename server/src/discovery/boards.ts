import fs from "node:fs";
import { z } from "zod";
import defaultBoards from "./board-list.json";
import { BoardConfig } from "./types";

const boardSchema = z.object({
  provider: z.enum(["greenhouse", "lever", "ashby"]),
  token: z.string().regex(/^[A-Za-z0-9._-]+$/),
  company: z.string().min(1),
  website: z.string().url().nullable().optional(),
});

// DISCOVERY_BOARDS_FILE can point at a different board list than board-list.json.
export function loadBoards(path = process.env.DISCOVERY_BOARDS_FILE): BoardConfig[] {
  let raw: unknown = defaultBoards;

  if (path) {
    raw = JSON.parse(fs.readFileSync(path, "utf8"));
  }

  return z.array(boardSchema).parse(raw);
}
