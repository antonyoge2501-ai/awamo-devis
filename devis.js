// api/devis.js
// Recoit les donnees d'un devis (JSON), remplit le gabarit devis.hbs,
// et renvoie un PDF A4 rendu par Chromium. Protege par un secret partage.

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// --- Gabarit compile une seule fois (reutilise entre les appels "a chaud") ---
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
  // 1) Methode
  if (req.method !== 'POST') {
    res.status(405).send('Methode non autorisee (POST uniquement).');
    return;
  }

  // 2) Secret partage
  const secret = process.env.AWAMO_SECRET;
  if (!secret || req.headers['x-awamo-secret'] !== secret) {
    res.status(401).send('Non autorise.');
    return;
  }

  // 3) Donnees
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch (e) { res.status(400).send('JSON invalide.'); return; }
  }
  if (!data || typeof data !== 'object') {
    res.status(400).send('Aucune donnee recue.');
    return;
  }

  // 4) Rendu
  let browser;
  try {
    const html = template(data);
    browser = await lancerChromium();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true, // respecte @page { size:A4; margin:0 } du gabarit
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
