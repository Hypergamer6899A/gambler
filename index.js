import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import express from "express";
import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const {
  TOKEN,
  GUILD_ID,
  CHANNEL_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
} = process.env;

// --- Firebase Setup ---
initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

// --- Discord Client Setup ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// --- Presence ---
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "/help | LETS GO GAMBLING", type: 0 }],
    status: "online",
  });
});

// --- Slash Command: /help ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "help") {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(
      "**Available Commands:**\n" +
      "`/help` - Show this help menu\n" +
      "`!g balance` - Check your balance\n" +
      "`!g roulette <red|black|odd|even> <amount>` - Bet on roulette"
    );
  }
});

// --- Message Commands ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CHANNEL_ID) return;
  if (!message.content.startsWith("!g")) return;

  const args = message.content.split(" ");
  const command = args[1]?.toLowerCase();

  const userRef = db.collection("users").doc(message.author.id);
  const userDoc = await userRef.get();
  let balance = userDoc.exists ? userDoc.data().balance : 1000;

  if (command === "balance") {
    return message.reply(`${message.author}, your balance is **${balance}**.`);
  }

  if (command === "roulette") {
    const betType = args[2];
    const betAmount = parseInt(args[3]);
    if (!betType || isNaN(betAmount)) {
      return message.reply(`${message.author}, usage: \`!g roulette <red|black|odd|even> <amount>\``);
    }
    if (betAmount <= 0 || betAmount > balance) {
      return message.reply(`${message.author}, invalid bet amount.`);
    }

    const outcomes = ["red", "black", "odd", "even"];
    if (!outcomes.includes(betType)) {
      return message.reply(`${message.author}, valid bets: red, black, odd, even.`);
    }

    const spin = Math.floor(Math.random() * 36) + 1;
    const color = spin === 0 ? "green" : spin % 2 === 0 ? "black" : "red";
    const parity = spin % 2 === 0 ? "even" : "odd";

    let win = false;
    if (betType === color || betType === parity) win = true;

    if (win) {
      balance += betAmount;
      await message.reply(`${message.author}, You won! The ball landed on **${spin} (${color})**. New balance: **${balance}**.`);
    } else {
      balance -= betAmount;
      await message.reply(`${message.author}, You lost! The ball landed on **${spin} (${color})**. New balance: **${balance}**.`);
    }

    await userRef.set({ balance }, { merge: true });
  }
});

// --- Dummy HTTP Server for Render ---
const app = express();
app.get("/", (req, res) => res.send("Bot is running."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// --- Login ---
client.login(TOKEN);
