const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    const launchOptions = { 
        headless: true,
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
    
    let browser;
    try {
        browser = await puppeteer.launch(launchOptions);
        console.log('Browser launched.');
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });

        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
        page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
        page.on('response', response => {
            if (response.status() === 404) console.log('404 NOT FOUND:', response.url());
        });
        
        console.log('Navigating to http://localhost:3000/?view=nations ...');
        await page.goto('http://localhost:3000/?view=nations', { 
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        console.log('Navigation successful.');
        
        console.log('Waiting for loading screen...');
        await page.waitForFunction(
            () => {
                const loading = document.getElementById('loading');
                return !loading || loading.style.display === 'none' || loading.classList.contains('fade-out');
            },
            { timeout: 40000 }
        );
        console.log('Loading screen cleared.');
        
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('Taking screenshot...');
        await page.screenshot({ path: 'test_screenshot.png' });
        console.log('Screenshot saved as test_screenshot.png');
        
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        if (browser) await browser.close();
        console.log('Browser closed.');
    }
}

test();
