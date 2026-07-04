import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

function keyFor(username) {
  return `wallet_data:${username}`;
}

export default async function handler(req, res) {
  const username = (req.query.user || "").toString().trim();

  if (!username) {
    return res.status(400).json({ error: "Missing user" });
  }

  if (req.method === "GET") {
    try {
      const data = await redis.get(keyFor(username));
      return res.status(200).json(data || null);
    } catch (err) {
      console.error("Redis get error:", err);
      return res.status(500).json({ error: "Failed to load data" });
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Invalid data" });
      }
      await redis.set(keyFor(username), body);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Redis set error:", err);
      return res.status(500).json({ error: "Failed to save data" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}
