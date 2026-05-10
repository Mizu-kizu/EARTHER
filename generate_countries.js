const fs = require('fs');
const { countries, continents } = require('countries-list');

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

// Load existing to preserve custom colors/facts
let existing = {};
try {
    existing = JSON.parse(fs.readFileSync('countries.json', 'utf8'));
} catch (e) {
    console.log("No existing countries.json found");
}

let added = 0;

for (const [code, info] of Object.entries(countries)) {
    let name = info.name;
    // Map some names to match GeoJSON or common usage
    if (name === "United Kingdom") name = "United Kingdom";
    
    if (!existing[name]) {
        let demonym = name + " Citizen";
        
        // Add smart suffixes
        if (name === "Bulgaria") demonym = "Bulgarian";
        else if (name.endsWith("ia")) demonym = name + "n";
        else if (name.endsWith("a")) demonym = name + "n";
        else if (name.endsWith("y")) demonym = name.slice(0, -1) + "ian";
        else if (name === "France") demonym = "French";
        else if (name === "Spain") demonym = "Spanish";
        else if (name === "Sweden") demonym = "Swedish";
        
        const continent = continents[info.continent] || "Unknown Continent";
        
        const hue = Math.floor(Math.random() * 360);
        const color = hslToHex(hue, 75, 60); // Use the same beautiful saturation
        
        existing[name] = {
            demonym,
            continent,
            fact: `A wonderful place in ${continent}!`,
            color
        };
        added++;
    }
}

// Also ensure map aliases are present
if (!existing['England']) {
    existing['England'] = { demonym: 'English', continent: 'Europe', fact: 'A wonderful place in Europe!', color: '#ff4444' };
}

// Write to the public folder!
fs.writeFileSync('public/countries.json', JSON.stringify(existing, null, 2));
console.log(`Added ${added} new countries. Saved to public/countries.json! Total: ${Object.keys(existing).length}`);
