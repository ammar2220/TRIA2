import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const USERS_INDEX_KEY = "wallet_users_index";

// ── Built-in admin account ──────────────────────────────────────────
// Change these two values any time to update the admin login.
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "sirius1234";
// ─────────────────────────────────────────────────────────────────────

function dataKeyFor(username) {
  return `wallet_data:${username}`;
}

async function ensureAdminUserExists() {
  const users = (await redis.get(USERS_INDEX_KEY)) || [];
  if (!users.includes(ADMIN_USERNAME)) {
    await redis.set(USERS_INDEX_KEY, [...users, ADMIN_USERNAME]);
  }

  const existingData = await redis.get(dataKeyFor(ADMIN_USERNAME));
  if (!existingData) {
    await redis.set(dataKeyFor(ADMIN_USERNAME), {
      settings: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      accounts: []
    });
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const users = (await redis.get(USERS_INDEX_KEY)) || [];
      return res.status(200).json(users);
    } catch (err) {
      console.error("Redis get users error:", err);
      return res.status(500).json({ error: "Failed to load users" });
    }
  }

  if (req.method === "POST") {
    try {
      const { action, username, password } = req.body || {};
      const cleanUsername = (username || "").toString().trim();
      const cleanPassword = (password || "").toString();

      if (!cleanUsername || !cleanPassword) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const isAdminUsername = cleanUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase();

      if (action === "create") {
        if (isAdminUsername) {
          return res.status(409).json({ error: "This username is reserved, please choose a different username" });
        }

        const users = (await redis.get(USERS_INDEX_KEY)) || [];
        if (users.includes(cleanUsername)) {
          return res.status(409).json({ error: "Username already exists" });
        }

        const newUsers = [...users, cleanUsername];
        await redis.set(USERS_INDEX_KEY, newUsers);

        const initialData = {
          settings: { username: cleanUsername, password: cleanPassword },
          accounts: []
        };
        await redis.set(dataKeyFor(cleanUsername), initialData);

        return res.status(200).json({ ok: true });
      }

      if (action === "login") {
        if (isAdminUsername) {
          if (cleanPassword !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: "Invalid username or password" });
          }
          await ensureAdminUserExists();
          return res.status(200).json({ ok: true });
        }

        const users = (await redis.get(USERS_INDEX_KEY)) || [];
        if (!users.includes(cleanUsername)) {
          return res.status(401).json({ error: "Invalid username or password" });
        }

        const userData = await redis.get(dataKeyFor(cleanUsername));
        if (!userData || userData.settings?.password !== cleanPassword) {
          return res.status(401).json({ error: "Invalid username or password" });
        }

        return res.status(200).json({ ok: true });
      }

      if (action === "changePassword") {
        if (isAdminUsername) {
          return res.status(403).json({ error: "The built-in admin password can only be changed in the code" });
        }

        const users = (await redis.get(USERS_INDEX_KEY)) || [];
        if (!users.includes(cleanUsername)) {
          return res.status(404).json({ error: "User not found" });
        }
        const userData = await redis.get(dataKeyFor(cleanUsername));
        if (!userData) return res.status(404).json({ error: "User not found" });

        userData.settings.password = cleanPassword;
        await redis.set(dataKeyFor(cleanUsername), userData);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Unknown action" });
    } catch (err) {
      console.error("Users API error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method Not Allowed" });
}

