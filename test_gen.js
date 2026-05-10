const fs = require('fs');

async function run() {
    const existing = JSON.parse(fs.readFileSync('countries.json', 'utf8'));
    const response = await fetch('https://restcountries.com/v3.1/all');
    const data = await response.json();
    
    let added = 0;
    for (const c of data) {
        const name = c.name.common;
        if (!existing[name]) {
            const demonym = c.demonyms?.eng?.m || name + " Citizen";
            const continent = c.continents?.[0] || "Unknown Continent";
            
            // Random distinct color logic
            const hue = Math.floor(Math.random() * 360);
            const color = `hsl(${hue}, 70%, 50%)`;
            
            existing[name] = {
                demonym,
                continent,
                fact: `A wonderful place in ${continent}!`,
                color
            };
            added++;
        }
    }
    
    console.log(`Added ${added} new countries. Total: ${Object.keys(existing).length}`);
    fs.writeFileSync('countries_test.json', JSON.stringify(existing, null, 2));
}

run();
