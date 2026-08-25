/* Deja que el navegador del sandbox llegue a Wikipedia: Node hace de puente.
   Guarda en disco lo que trae, para no repetirle preguntas a Wikipedia. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = path.join(__dirname, 'wkcache');
fs.mkdirSync(DIR, { recursive: true });
let ultima = 0;

module.exports = async function puente(p) {
  await p.route('**/*.wikipedia.org/w/api.php*', async route => {
    const url = route.request().url();
    const f = path.join(DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
    if (fs.existsSync(f)) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f, 'utf8') });
    }
    const espera = Math.max(0, 1200 - (Date.now() - ultima));
    if (espera) await new Promise(r => setTimeout(r, espera));
    ultima = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'ColeccionMangas/1.0 (pruebas; aitor1393@gmail.com)' } });
      const body = await r.text();
      if (r.status === 200) fs.writeFileSync(f, body);
      route.fulfill({ status: r.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body });
    } catch (e) { route.abort(); }
  });
};
