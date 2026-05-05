const fs = require('fs');
let data = JSON.parse(fs.readFileSync('public/countries.json', 'utf8'));

if (data['United States']) {
    data['USA'] = data['United States'];
    data['USA'].demonym = 'American'; // A much better demonym than "United States Citizen"
    delete data['United States'];
    
    fs.writeFileSync('public/countries.json', JSON.stringify(data, null, 2));
    console.log('Successfully migrated United States to USA');
} else {
    console.log('United States not found in countries.json');
}
