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

/**
 * Boards come from board-list.json (verified public Greenhouse/Lever/Ashby boards with Canadian jobs),
 * or from the JSON file named by DISCOVERY_BOARDS_FILE when set.
 */
export function loadBoards(path = process.env.DISCOVERY_BOARDS_FILE): BoardConfig[] {
  const raw: unknown = path ? JSON.parse(fs.readFileSync(path, "utf8")) : defaultBoards;
  return z.array(boardSchema).parse(raw);
}
