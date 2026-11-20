#!/usr/bin/env node
// Discord bot: /claude <prompt> runs Claude Code in PROJECT_DIR, so you can code from your phone.
// Start: npm start (reads .env, see .env.example)
// Zero dependencies: uses Node's built-in WebSocket and fetch.
const { spawn } = require("node:child_process");

const { DISCORD_BOT_TOKEN: TOKEN, DISCORD_OWNER: OWNER, DISCORD_WEBHOOK_URL: WEBHOOK, PROJECT_DIR: ROOT } = process.env;
const PERMISSION_MODE = process.env.CLAUDE_PERMISSION_MODE || "auto";
if (!TOKEN || !OWNER || !ROOT) { console.error("DISCORD_BOT_TOKEN, DISCORD_OWNER and PROJECT_DIR are required in .env"); process.exit(1); }

const API = "https://discord.com/api/v10";
const auth = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

const COMMAND = {
  name: "claude",
  description: "Send a prompt to Claude Code on your project",
  options: [
    { type: 3, name: "prompt", description: "What Claude should do", required: true },
    { type: 5, name: "new", description: "Start a new conversation (otherwise continue the previous one)" },
  ],
};

let sessionId = null; // shortcut: lost when the bot restarts, persist it to a file if that matters
let queue = Promise.resolve();

// Results go through the webhook: the interaction token expires after 15 min and a task can take longer.
async function post(content) {
  if (!WEBHOOK) return console.log(content);
  for (let i = 0; i < content.length; i += 1990) {
    await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(i, i + 1990) }) }).catch(e => console.error("webhook", e));
  }
}

function runClaude(prompt, fresh) {
  // stream-json instead of json: a Stop hook that queries the model can break the final message
  // ("No messages returned from query"); the stream still holds the answer already written.
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", PERMISSION_MODE];
  if (!fresh && sessionId) args.push("--resume", sessionId);
  return new Promise(resolve => {
    const p = spawn("claude", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("error", e => resolve(`❌ Could not start claude: ${e.message}`));
    p.on("close", code => {
      let result = null, lastText = null;
      for (const line of out.split("\n")) {
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.session_id) sessionId = m.session_id;
        if (m.type === "result") result = m;
        if (m.type === "assistant") {
          const text = (m.message?.content ?? []).filter(c => c.type === "text").map(c => c.text).join("\n");
          if (text) lastText = text;
        }
      }
      if (result?.result) resolve(`${result.is_error ? "❌" : "✅"} ${result.result}`);
      else if (lastText) resolve(`✅ ${lastText}`);
      else resolve(`❌ claude exited (code ${code})\n${(err || out).slice(-1500)}`);
    });
  });
}

async function onInteraction(i) {
  if (i.type !== 2 || i.data.name !== "claude") return;
  const user = i.member?.user ?? i.user;
  const opt = Object.fromEntries((i.data.options ?? []).map(o => [o.name, o.value]));
  // Security: this bot runs code on your machine. An ID is safer than a username (a freed username can be taken).
  const allowed = user.id === OWNER || user.username === OWNER;
  if (!allowed) console.error(`Denied: ${user.username} (${user.id})`);
  // Discord requires a reply within 3 s, otherwise it shows "The application did not respond"
  await fetch(`${API}/interactions/${i.id}/${i.token}/callback`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ type: 4, data: allowed
      ? { content: `⏳ ${opt.new ? "New conversation" : "Continuing"}: ${opt.prompt.slice(0, 1800)}` }
      : { content: "⛔ This bot only answers its owner.", flags: 64 } }),
  }).catch(e => console.error("callback", e));
  if (!allowed) return;
  if (opt.new) sessionId = null;
  // One task at a time: two Claude runs in the same repo would step on each other
  queue = queue.then(async () => post(`🤖 **/claude** ${opt.prompt.slice(0, 80)}\n${await runClaude(opt.prompt, !!opt.new)}`));
}

function connect() {
  const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
  let seq = null, beat;
  ws.onmessage = async ({ data }) => {
    const { op, d, s, t } = JSON.parse(data);
    if (s) seq = s;
    if (op === 10) {
      beat = setInterval(() => ws.send(JSON.stringify({ op: 1, d: seq })), d.heartbeat_interval);
      ws.send(JSON.stringify({ op: 2, d: { token: TOKEN, intents: 0, properties: { os: process.platform, browser: "claude-discord-bot", device: "claude-discord-bot" } } }));
    } else if (op === 1) ws.send(JSON.stringify({ op: 1, d: seq }));
    else if (op === 7 || op === 9) ws.close();
    else if (t === "READY") {
      const res = await fetch(`${API}/applications/${d.application.id}/commands`, { method: "PUT", headers: auth, body: JSON.stringify([COMMAND]) });
      console.log(`Logged in as ${d.user.username}, /claude command: HTTP ${res.status}`);
    } else if (t === "INTERACTION_CREATE") onInteraction(d).catch(e => console.error("interaction", e));
  };
  // shortcut: full reconnect (no resume), a /claude sent during the gap is lost
  ws.onclose = e => { clearInterval(beat); console.error(`Gateway closed (${e.code}), reconnecting in 5 s`); setTimeout(connect, 5000); };
  ws.onerror = () => {};
}

connect();
