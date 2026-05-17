import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
page.on('console', msg => errors.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', err => errors.push({ type: 'pageerror', text: err.message, stack: err.stack }));

try {
  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  const rootHTML = await page.evaluate(() => document.getElementById('root')?.innerHTML?.substring(0, 1000));

  console.log('=== PAGE INFO ===');
  console.log('Title:', title);
  console.log('Body text:', bodyText);
  console.log('Root HTML:', rootHTML);

  console.log('\n=== CONSOLE ERRORS ===');
  for (const err of errors) {
    if (err.type === 'pageerror') {
      console.log('PAGE ERROR:', err.text);
      if (err.stack) console.log('STACK:', err.stack.split('\n').slice(0, 5).join('\n'));
    } else if (err.type === 'error' || err.type === 'warning') {
      console.log(`${err.type.toUpperCase()}: ${err.text}`);
    }
  }

  if (errors.length === 0) {
    console.log('No errors captured.');
  }

} catch (e) {
  console.log('Navigation error:', e.message);
}

await browser.close();
