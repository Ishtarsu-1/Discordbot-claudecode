# Discordbot-claudecode

Commande Discord `/claude <prompt>` qui lance [Claude Code](https://claude.com/claude-code) sur un projet de ton PC. Tu peux donc coder depuis ton téléphone.

- `/claude prompt:...` reprend la conversation précédente, pour enchaîner.
- `/claude prompt:... nouveau:True` démarre une nouvelle conversation.
- La réponse de Claude arrive dans le salon du webhook.
- Les prompts passent un par un.
- Seul `DISCORD_OWNER` peut s'en servir.

Aucune dépendance : il suffit de Node 22 ou plus et de `claude` dans le PATH.

## Installation

1. Sur https://discord.com/developers/applications, crée une application. Dans l'onglet **Bot**, clique sur **Reset Token** pour obtenir le token.
2. Dans **OAuth2 → URL Generator**, coche `bot` et `applications.commands`, puis ouvre l'URL générée pour inviter le bot sur ton serveur.
3. Copie `.env.example` vers `.env` et remplis-le.
4. Lance `npm start`. Tu dois voir « Connecté en tant que … ».

## Démarrage automatique (Linux, systemd)

```
ln -s "$PWD/claude-discord-bot.service" ~/.config/systemd/user/
systemctl --user enable --now claude-discord-bot
loginctl enable-linger $USER
journalctl --user -u claude-discord-bot -f
```

Le PC doit rester allumé : en veille, il ne reçoit rien.

## Sécurité

Claude tourne en `--permission-mode auto` : il modifie des fichiers, lance des commandes et commit sans te demander de valider. Garde `DISCORD_OWNER` sur ton compte. Mieux vaut mettre ton ID numérique plutôt que ton pseudo : un pseudo libéré peut être repris par quelqu'un d'autre.
