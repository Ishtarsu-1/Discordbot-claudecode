# Discordbot-claudecode

A Discord slash command, `/claude <prompt>`, that runs [Claude Code](https://claude.com/claude-code) on a project on your computer. Use it to code from your phone. If your repo already sends commit notifications to Discord, you can read Claude's last commit and send the next prompt from the same channel.

- `/claude prompt:...` continues the previous conversation.
- `/claude prompt:... new:True` starts a fresh conversation.
- Claude's answer is posted to the webhook channel.
- Prompts run one at a time.
- Only `DISCORD_OWNER` can use the command. Everyone else gets a private refusal.

There are no dependencies. You need Node 22 or later, and Claude Code installed and logged in (`claude` in your PATH).

## Setup

1. Go to https://discord.com/developers/applications and click **New Application**. In the **Bot** tab, click **Reset Token** and copy the token.
2. In **OAuth2 → URL Generator**, tick `bot` and `applications.commands`. Open the generated URL and invite the bot to your server.
3. Optional: in the channel settings, go to **Integrations → Webhooks**, create a webhook and copy its URL. Claude's answers will be posted there.
4. Run:
   ```
   git clone https://github.com/Ishtarsu-1/Discordbot-claudecode.git && cd Discordbot-claudecode
   cp .env.example .env   # then fill it in
   npm start              # should print "Logged in as ..."
   ```
5. In Discord, type `/claude` and **pick the command from the popup**. Don't press Enter on the raw text: that sends a normal message, and the bot doesn't read messages.

To find your Discord ID, enable **Settings → Advanced → Developer Mode**, then right-click your name and choose **Copy User ID**.

## Run it in the background (Linux, systemd)

```
mkdir -p ~/.config/systemd/user
sed "s#__DIR__#$PWD#" claude-discord-bot.service > ~/.config/systemd/user/claude-discord-bot.service
systemctl --user daemon-reload
systemctl --user enable --now claude-discord-bot
loginctl enable-linger $USER          # keep it running when you are logged out
journalctl --user -u claude-discord-bot -f
```

Your computer must stay awake. A sleeping machine receives nothing.

## Security

- The bot runs code on your machine. With the default `CLAUDE_PERMISSION_MODE=auto`, Claude edits files, runs commands and commits without asking you first.
- Set `DISCORD_OWNER` to your **numeric ID** rather than a username: a username that gets freed up can be claimed by someone else.
- Never commit `.env`. It is already in `.gitignore`.

## Limits

- The current conversation is kept in memory. Restarting the bot starts a new one.
- If the connection to Discord drops, the bot reconnects after 5 seconds. A `/claude` sent during that gap is lost.

## License

MIT
