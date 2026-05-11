require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');

// --- LOAD COUNTRIES DICTIONARY ---
const countriesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'countries.json'), 'utf8'));

// Helper function to resolve country gracefully
function resolveCountry(inputName) {
    // Normalize input
    let normalizedInput = inputName.trim().toLowerCase();
    
    // Common aliases mapping
    const inputAliases = {
        'america': 'usa',
        'united states of america': 'usa',
        'united states': 'usa',
        'us': 'usa',
        'uk': 'united kingdom',
        'britain': 'united kingdom',
        'great britain': 'united kingdom',
        'uae': 'united arab emirates'
    };
    
    if (inputAliases[normalizedInput]) {
        normalizedInput = inputAliases[normalizedInput];
    }
    
    // Find exact match case-insensitive
    const exactMatch = Object.keys(countriesData).find(c => c.toLowerCase() === normalizedInput);
    if (exactMatch) return { name: exactMatch, ...countriesData[exactMatch] };

    // Reject invalid countries
    return null;
}

// --- EXPRESS SERVER SETUP ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ─── NASA Texture Proxy ────────────────────────────────────────────────────────
// NASA servers block browser CORS requests. We proxy them through Express so
// globe.js can load NASA imagery without Cross-Origin errors.
const https = require('https');
const http  = require('http');

const TEXTURE_URLS = {
  'topo':   'https://unpkg.com/three-globe/example/img/earth-day.jpg',
  'normal': 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
  'spec':   'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
};

app.get('/tex/:id', async (req, res) => {
  const url = TEXTURE_URLS[req.params.id];
  if (!url) return res.status(404).send('Unknown texture');

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Upstream error ${response.status} for ${url}`);
      return res.status(response.status).send('Upstream error');
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Length', buffer.byteLength);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Texture proxy error:', err.message);
    res.status(502).send('Texture fetch failed');
  }
});

// --- DISCORD BOT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

// The magical color scaler algorithm
const COLOR_STATES = [
    { clicks: 0, color: '#334155' },
    { clicks: 1, color: '#ef4444' }, // Red
    { clicks: 2, color: '#3b82f6' }, // Blue
    { clicks: 3, color: '#10b981' }, // Green
    { clicks: 4, color: '#f59e0b' }, // Yellow
    { clicks: 5, color: '#8b5cf6' }  // Purple
];

function getRoleColor(count) {
    if (count < COLOR_STATES.length) {
        return COLOR_STATES[count].color;
    }
    const hue = (count * 137.5) % 360;
    return hslToHex(hue, 75, 60);
}

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// API endpoint to serve the live counts to the web map
app.get('/api/counts', async (req, res) => {
    try {
        const nationCounts = {};
        const continentCounts = {};
        
        // Loop through all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            // Removed await guild.members.fetch() to prevent API rate limiting crashes!
            
            // Loop through roles
            guild.roles.cache.forEach(role => {
                const roleNameLower = role.name.toLowerCase();
                
                // If it's a continent role
                const continentsLower = ['north america', 'south america', 'europe', 'asia', 'africa', 'oceania', 'antarctica', 'unknown continent'];
                if (continentsLower.includes(roleNameLower)) {
                    // Find the properly capitalized continent name
                    const correctContinent = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania', 'Antarctica', 'Unknown Continent']
                        .find(c => c.toLowerCase() === roleNameLower);
                    continentCounts[correctContinent] = (continentCounts[correctContinent] || 0) + role.members.size;
                }
                
                // If it's a demonym role
                const countryEntry = Object.entries(countriesData).find(([_, data]) => data.demonym.toLowerCase() === roleNameLower);
                if (countryEntry) {
                    nationCounts[countryEntry[0]] = (nationCounts[countryEntry[0]] || 0) + role.members.size;
                } else if (roleNameLower.endsWith(" citizen")) {
                    // Fallback demonym
                    const countryName = role.name.substring(0, role.name.length - 8); // Remove " Citizen"
                    nationCounts[countryName] = (nationCounts[countryName] || 0) + role.members.size;
                }
            });
        }
        res.json({ nations: nationCounts, continents: continentCounts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch counts' });
    }
});

client.once('clientReady', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    
    // Fetch all members on startup to ensure accurate role counts
    console.log('Fetching members to populate cache...');
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.fetch();
            console.log(`Cached members for ${guild.name}`);
        } catch (err) {
            console.error(`Failed to fetch members for ${guild.name}:`, err);
        }
    }
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = [
        new SlashCommandBuilder()
            .setName('claim')
            .setDescription('Claim your country!')
            .addStringOption(option => 
                option.setName('country')
                .setDescription('The exact name of your country (e.g. Canada)')
                .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('remove')
            .setDescription('Remove your claimed country'),
        new SlashCommandBuilder()
            .setName('map')
            .setDescription('View the live interactive map and leaderboard in Discord!'),
        new SlashCommandBuilder()
            .setName('mycountry')
            .setDescription('See your citizen nation card!')
    ];

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands.map(c => c.toJSON()) },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    
    // ==========================================
    // SLASH COMMANDS
    // ==========================================
    if (interaction.isChatInputCommand()) {
        if (interaction.replied || interaction.deferred) return;
        const guild = interaction.guild;
        // Removed await guild.members.fetch() to avoid rate limits

        if (interaction.commandName === 'claim') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

            // Check if user already claimed
            const userRoles = interaction.member.roles.cache;
            const hasDemonym = userRoles.some(r => Object.values(countriesData).some(d => d.demonym === r.name) || r.name.endsWith(" Citizen"));
            if (hasDemonym) {
                return interaction.editReply('❌ You have already claimed a country! Use `/remove` first if you want to switch.');
            }

            const inputCountry = interaction.options.getString('country');
            const countryInfo = resolveCountry(inputCountry);

            if (!countryInfo) {
                return interaction.editReply(`❌ **${inputCountry}** is not a valid country! Please spell it correctly (e.g. Canada, Brazil, Japan).`);
            }

            try {
                // 1. Manage Continent Role
                let continentRole = guild.roles.cache.find(r => r.name === countryInfo.continent);
                if (!continentRole) {
                    continentRole = await guild.roles.create({
                        name: countryInfo.continent,
                        color: '#64748b', // Grey standard color for continents
                        reason: 'New Continent role created via /claim',
                    });
                }

                // 2. Manage Nation (Demonym) Role
                let nationRole = guild.roles.cache.find(r => r.name === countryInfo.demonym);
                if (!nationRole) {
                    nationRole = await guild.roles.create({
                        name: countryInfo.demonym,
                        color: countryInfo.color || getRoleColor(1),
                        reason: 'New Demonym role created via /claim',
                    });
                }

                // Assign roles
                await interaction.member.roles.add([continentRole, nationRole]);

                // 3. Ensure Hierarchy (Nation above Continent)
                if (nationRole.position <= continentRole.position) {
                    await nationRole.setPosition(continentRole.position + 1).catch(() => console.log("Missing perms to hoist"));
                }

                await interaction.editReply(`🌍 You've successfully claimed **${countryInfo.name}**!\nYou've been given the **${continentRole.name}** and **${nationRole.name}** roles.\n\n*${countryInfo.fact}*`);
                
            } catch (error) {
                console.error(error);
                await interaction.editReply('There was an error claiming your country. Please ensure my highest role is above the country roles and I have Manage Roles permissions.');
            }
        }

        if (interaction.commandName === 'remove') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
                const userRoles = interaction.member.roles.cache;
                const rolesToRemove = userRoles.filter(r => 
                    Object.values(countriesData).some(d => d.demonym === r.name || d.continent === r.name) || 
                    r.name.endsWith(" Citizen") || 
                    r.name === "Unknown Continent"
                );

                for (const r of rolesToRemove.values()) {
                    await interaction.member.roles.remove(r);
                }
                
                await interaction.editReply('🗑️ Your country claims have been removed!');
            } catch (error) {
                await interaction.editReply('Error removing your roles.');
            }
        }

        if (interaction.commandName === 'map') {
            await interaction.reply({ content: "🛰️ **[V2] Deploying satellites to scan the globe...**\n*Taking a live photo of the dashboard...*" });
            await sendInteractiveMap(interaction, 'nations');
        }

        if (interaction.commandName === 'mycountry') {
            const roles = interaction.member.roles.cache;
            let foundCountry = null;
            let countryName = null;

            // Search for a matching nation role
            for (const [name, data] of Object.entries(countriesData)) {
                if (roles.some(r => r.name.toLowerCase() === data.demonym.toLowerCase() || r.name.toLowerCase() === `${name.toLowerCase()} citizen`)) {
                    foundCountry = data;
                    countryName = name;
                    break;
                }
            }

            if (!foundCountry) {
                return interaction.reply({ content: "❓ You don't have a citizen role yet! Use `/claim [country]` first to join a nation.", flags: [MessageFlags.Ephemeral] });
            }

            const embed = new EmbedBuilder()
                .setColor(foundCountry.color || '#3b82f6')
                .setTitle(`${foundCountry.flag || '🌍'}  ${countryName}`)
                .setDescription(`Welcome, citizen of **${countryName}**!`)
                .addFields(
                    { name: '🏛️ Capital',    value: foundCountry.capital || 'Unknown',  inline: true },
                    { name: '👥 Population', value: foundCountry.pop     || 'Unknown',  inline: true },
                    { name: '🗣️ Language',   value: foundCountry.lang    || 'Unknown',  inline: true },
                    { name: '💰 Currency',   value: foundCountry.currency|| 'Unknown',  inline: true },
                    { name: '💡 Fun Fact',   value: foundCountry.fact    || 'A wonderful place on Earth!' }
                )
                .setFooter({ text: `Detected from role • ${interaction.user.username}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }

    // ==========================================
    // BUTTON INTERACTIONS
    // ==========================================
    if (interaction.isButton()) {
        if (interaction.replied || interaction.deferred) return;
        const targetView = interaction.customId === 'view_continents' ? 'Continents' : 'Nations';
        await interaction.update({ content: `🛰️ **Re-calibrating satellites to view ${targetView}...**\n*Processing new high-res image...*`, components: [] });
        
        if (interaction.customId === 'view_nations') {
            await sendInteractiveMap(interaction, 'nations', true);
        } else if (interaction.customId === 'view_continents') {
            await sendInteractiveMap(interaction, 'continents', true);
        }
    }

    // ==========================================
    // SELECT MENU INTERACTIONS
    // ==========================================
    if (interaction.isStringSelectMenu()) {
        if (interaction.replied || interaction.deferred) return;
        if (interaction.customId === 'country_facts') {
            const countryName = interaction.values[0];
            const fact = countriesData[countryName]?.fact || "A wonderful place on Earth!";
            await interaction.reply({ content: `**${countryName}**: *${fact}*`, flags: [MessageFlags.Ephemeral] });
        }
    }
});

// Helper to take screenshot and send
async function sendInteractiveMap(interaction, view, isUpdate = false) {
    let browser;
    try {
        // --- 1. Pre-check: Ensure the local server is actually responding ---
        const serverUrl = `http://127.0.0.1:${PORT}`;
        try {
            const resp = await fetch(serverUrl, { signal: AbortSignal.timeout(5000) });
            if (!resp.ok) console.warn(`[Warning] Local server check returned status ${resp.status}`);
        } catch (e) {
            console.error(`[Critical] Local server check failed: ${e.message}`);
            throw new Error(`The map server is not responding at ${serverUrl}. Please ensure the bot is started correctly.`);
        }

        const launchOptions = { 
            headless: true, // Use the stable new headless mode
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--enable-webgl',
                '--use-gl=angle',
                '--use-angle=d3d11',
                '--ignore-gpu-blocklist',
                '--disable-dev-shm-usage',
                '--disable-web-security',
            ] 
        };
        // On Render (Docker), use the pre-installed Chrome from the image
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        // Set high res
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
        
        // Log browser console errors for debugging
        page.on('console', msg => {
            if (msg.type() === 'error') console.log('[Puppeteer Page Error]', msg.text());
        });
        page.on('pageerror', err => console.log('[Puppeteer Page Crash]', err.message));

        // Use 127.0.0.1 to avoid IPv6 issues on Windows
        await page.goto(`http://127.0.0.1:${PORT}/?view=${view}`, { 
            waitUntil: 'networkidle2',
            timeout: 60000              // Increased to 60s
        });
        
        // Wait for the loading screen to fade out + globe to render a few frames
        await page.waitForFunction(
            () => {
                const loading = document.getElementById('loading');
                return !loading || loading.style.display === 'none' || loading.classList.contains('fade-out');
            },
            { timeout: 40000 }
        ).catch(() => {
            console.log('Loading screen did not fade out, taking screenshot anyway...');
        });
        
        // Give WebGL an extra moment to render
        await new Promise(r => setTimeout(r, 2000));
        
        // Take screenshot
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        await browser.close();
        browser = null;

        const attachment = new AttachmentBuilder(screenshotBuffer, { name: 'map.png' });

        // Build Buttons
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('view_nations')
                    .setLabel('Nations Leaderboard')
                    .setStyle(view === 'nations' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setEmoji('🌍'),
                new ButtonBuilder()
                    .setCustomId('view_continents')
                    .setLabel('Continents Leaderboard')
                    .setStyle(view === 'continents' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setEmoji('🗺️')
            );

        // Build Select Menu for top 25 countries from our list
        const options = Object.keys(countriesData).slice(0, 25).map(c => ({
            label: c,
            value: c,
            description: `Learn a cool fact about ${c}`
        }));

        const row2 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('country_facts')
                    .setPlaceholder('Discover a cool fact about a nation!')
                    .addOptions(options)
            );

        const payload = {
            content: `**Live Territory Tracker** - Viewing *${view}*`,
            files: [attachment],
            components: [row1, row2]
        };

        if (isUpdate) {
            await interaction.editReply(payload);
        } else {
            await interaction.editReply(payload);
        }

    } catch (err) {
        console.error('Map screenshot failed:', err.message);
        console.error(err.stack);
        await interaction.editReply({ content: `❌ Failed to generate map screenshot: ${err.message}` }).catch(() => {});
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

// Start Express and Discord
app.listen(PORT, () => {
    console.log(`Live map dashboard running at http://localhost:${PORT}`);
});

(async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        console.log('Bot logged in successfully');
    } catch (error) {
        console.error('Failed to login to Discord:', error.message);
        process.exit(1);
    }
})();
