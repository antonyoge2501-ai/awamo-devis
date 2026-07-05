// api/devis.js
const fs = require('fs');
const path = require('path');

const PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'devis.hbs');
const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf8');

let _template = null;
async function getTemplate() {
  if (!_template) {
    const Handlebars = (await import('handlebars')).default;
    _template = Handlebars.compile(templateSource);
  }
  return _template;
}

async function lancerChromium() {
  const chromium = (await import('@sparticuz/chromium-min')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(PACK_URL),
    headless: chromium.headless,
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Methode non autorisee (POST uniquement).');
    return;
  }

  const secret = process.env.AWAMO_SECRET;
  if (!secret || req.headers['x-awamo-secret'] !== secret) {
    res.status(401).send('Non autorise.');
    return;
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch (e) { res.status(400).send('JSON invalide.'); return; }
  }
  if (!data || typeof data !== 'object') {
    res.status(400).send('Aucune donnee recue.');
    return;
  }

  let browser;
  try {
    const template = await getTemplate();
    const html = template(data);
    browser = await lancerChromium();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });

    const nom = 'Devis ' + (data.numDevis || 'AWAMO') +
                (data.copro ? ' - ' + data.copro : '') + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + nom.replace(/"/g, '') + '"');
    res.status(200).end(Buffer.from(pdf));
  } catch (err) {
    res.status(500).send('Erreur generation PDF : ' + (err && err.message ? err.message : err));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }
};
