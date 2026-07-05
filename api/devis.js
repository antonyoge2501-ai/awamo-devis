// api/devis.js
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'devis.hbs');
const template = Handlebars.compile(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

async function lancerChromium() {
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
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
    res.status(200).send(pdf);
  } catch (err) {
    res.status(500).send('Erreur generation PDF : ' + (err && err.message ? err.message : err));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
  }
};
