import { Router } from "express";
import { pool } from "../db.js";

export const avatarsRouter = Router();

avatarsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT mime_type, image_data FROM user_avatars WHERE id = $1`,
    [req.params.id],
  );

  if (rows.length === 0) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", rows[0].mime_type);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(rows[0].image_data);
});