import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
dotenv.config();

// Environment variables
const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  CHANNEL_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
} = process.env;

// Firebase initialization
initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Register /help slash command
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Show available commands and rules").toJSON(),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
})();

// Handle /help command
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "help") return;

  try {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(
      "**Available Commands:**\n" +
        "`/help` — show this menu\n" +
        "`!g balance` — check your balance\n" +
        "`!g roulette <red|black|odd|even> <amount>` — bet on roulette"
    );
  } catch (err) {
    console.error("Error responding to /help:", err);
  }
});

// Utility: get or create user balance
async function getUserBalance(userId) {
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ balance: 1000 });
    return 1000;
  }
  return snap.data().balance;
}

// Utility: set user balance
async function setUserBalance(userId, balance) {
  const ref = db.collection("users").doc(userId);
  await ref.set({ balance }, { merge: true });
}

// Handle text-based gambling
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== CHANNEL_ID) return;
  if (!msg.content.startsWith("!g")) return;

  const args = msg.content.trim().split(/\s+/);
  const command = args[1];

  try {
    if (command === "balance") {
      const balance = await getUserBalance(msg.author.id);
      return msg.reply(`${msg.author.username}, your balance is **${balance}** coins.`);
    }

    if (command === "roulette") {
      const choice = args[2]?.toLowerCase();
      const amount = parseInt(args[3]);

      if (!["red", "black", "odd", "even"].includes(choice))
        return msg.reply("Usage: `!g roulette <red|black|odd|even> <amount>`");
      if (isNaN(amount) || amount <= 0) return msg.reply("Enter a valid bet amount.");

      let balance = await getUserBalance(msg.author.id);
      if (amount > balance) return msg.reply("You don't have enough coins.");

      const spin = Math.floor(Math.random() * 37); // 0–36
      const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
      const color = spin === 0 ? "green" : redNumbers.includes(spin) ? "red" : "black";
      const parity = spin === 0 ? "none" : spin % 2 === 0 ? "even" : "odd";

      const win = choice === color || choice === parity;
      balance += win ? amount : -amount;
      await setUserBalance(msg.author.id, balance);

      msg.reply(
        `🎯 The wheel landed on **${color} ${spin}** — you ${win ? "**won**" : "**lost**"}!\nNew balance: **${balance}**`
      );
      return;
    }

    msg.reply("Invalid command. Type `/help` for usage.");
  } catch (err) {
    console.error("Message handling error:", err);
    msg.reply("Something went wrong while processing your command.");
  }
});

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.login(TOKEN);
