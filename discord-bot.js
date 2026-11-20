#!/usr/bin/env node
// Bot Discord : /claude <prompt> lance Claude Code dans PROJECT_DIR, depuis ton téléphone.
// Lancement : npm start (lit .env, voir .env.example)
// Zéro dépendance : WebSocket et fetch natifs de Node.
const { spawn } = require("node:child_process");

const { DISCORD_BOT_TOKEN: TOKEN, DISCORD_OWNER: OWNER, DISCORD_WEBHOOK_URL: WEBHOOK, PROJECT_DIR: ROOT } = process.env;
if (!TOKEN || !OWNER || !ROOT) { console.error("DISCORD_BOT_TOKEN, DISCORD_OWNER et PROJECT_DIR requis dans .env"); process.exit(1); }

const API = "https://discord.com/api/v10";
const auth = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

const COMMAND = {
  name: "claude",
  description: "Envoie un prompt à Claude Code sur ton projet",
  options: [
    { type: 3, name: "prompt", description: "Ce que Claude doit faire", required: true },
    { type: 5, name: "nouveau", description: "Nouvelle conversation (sinon on enchaîne sur la précédente)" },
  ],
};

let sessionId = null; // shortcut: perdu au redémarrage du bot, le stocker dans un fichier si ça gêne
let queue = Promise.resolve();

// Le résultat part par le webhook : le jeton d'interaction expire après 15 min, une tâche peut durer plus.
async function post(content) {
  if (!WEBHOOK) return console.log(content);
  for (let i = 0; i < content.length; i += 1990) {
    await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(i, i + 1990) }) }).catch(e => console.error("webhook", e));
  }
}

function runClaude(prompt, fresh) {
  const args = ["-p", prompt, "--output-format", "json", "--permission-mode", "auto"];
  if (!fresh && sessionId) args.push("--resume", sessionId);
  return new Promise(resolve => {
    const p = spawn("claude", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("error", e => resolve(`❌ Impossible de lancer claude : ${e.message}`));
    p.on("close", code => {
      try {
        const r = JSON.parse(out);
        if (r.session_id) sessionId = r.session_id;
        resolve(`${r.is_error ? "❌" : "✅"} ${r.result || "(pas de texte)"}`);
      } catch { resolve(`❌ claude a quitté (code ${code})\n${(err || out).slice(-1500)}`); }
    });
  });
}

async function onInteraction(i) {
  if (i.type !== 2 || i.data.name !== "claude") return;
  const user = i.member?.user ?? i.user;
  const opt = Object.fromEntries((i.data.options ?? []).map(o => [o.name, o.value]));
  // sécurité : le bot exécute du code sur ce PC. Un ID est plus sûr qu'un pseudo (un pseudo libéré peut être repris).
  const allowed = user.id === OWNER || user.username === OWNER;
  if (!allowed) console.error(`Refusé : ${user.username} (${user.id})`);
  // Réponse obligatoire sous 3 s, sinon Discord affiche « l'application ne répond pas »
  await fetch(`${API}/interactions/${i.id}/${i.token}/callback`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ type: 4, data: allowed
      ? { content: `⏳ ${opt.nouveau ? "Nouvelle conversation" : "On enchaîne"} : ${opt.prompt.slice(0, 1800)}` }
      : { content: "⛔ Bot réservé à son propriétaire.", flags: 64 } }),
  }).catch(e => console.error("callback", e));
  if (!allowed) return;
  if (opt.nouveau) sessionId = null;
  // Une tâche à la fois : deux Claude dans le même dépôt se marcheraient dessus
  queue = queue.then(async () => post(`🤖 **/claude** ${opt.prompt.slice(0, 80)}\n${await runClaude(opt.prompt, !!opt.nouveau)}`));
}

function connect() {
  const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
  let seq = null, beat;
  ws.onmessage = async ({ data }) => {
    const { op, d, s, t } = JSON.parse(data);
    if (s) seq = s;
    if (op === 10) {
      beat = setInterval(() => ws.send(JSON.stringify({ op: 1, d: seq })), d.heartbeat_interval);
      ws.send(JSON.stringify({ op: 2, d: { token: TOKEN, intents: 0, properties: { os: "linux", browser: "mochi", device: "mochi" } } }));
    } else if (op === 1) ws.send(JSON.stringify({ op: 1, d: seq }));
    else if (op === 7 || op === 9) ws.close();
    else if (t === "READY") {
      const res = await fetch(`${API}/applications/${d.application.id}/commands`, { method: "PUT", headers: auth, body: JSON.stringify([COMMAND]) });
      console.log(`Connecté en tant que ${d.user.username}, commande /claude : HTTP ${res.status}`);
    } else if (t === "INTERACTION_CREATE") onInteraction(d).catch(e => console.error("interaction", e));
  };
  // shortcut: reconnexion complète (pas de resume), un /claude envoyé pile pendant la coupure est perdu
  ws.onclose = e => { clearInterval(beat); console.error(`Gateway fermée (${e.code}), reconnexion dans 5 s`); setTimeout(connect, 5000); };
  ws.onerror = () => {};
}

connect();
