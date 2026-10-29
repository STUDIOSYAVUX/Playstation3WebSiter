const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.send(`
            <html>
            <head><meta charset="UTF-8"><title>PS3 Evrensel Web Proxy</title></head>
            <body style="background:#111; color:#fff; text-align:center; font-family:sans-serif; padding-top:100px;">
                <h1 style="color:#00ff00; font-size:28px;">PS3 Evrensel Web Proxy</h1>
                <p style="color:#aaa;">Gitmek istediğiniz HERHANGİ bir sitenin adresini yazın (Dizi, Haber, Forum vb.):</p>
                <form action="/" method="get">
                    <input type="text" name="url" value="https://" style="width:70%; max-width:500px; padding:12px; font-size:16px; border:2px solid #00ff00; background:#222; color:#fff; border-radius:5px;"/>
                    <br/><br/>
                    <button type="submit" style="padding:12px 30px; font-size:16px; background:#00ff00; border:none; color:#000; font-weight:bold; cursor:pointer; border-radius:5px;">SİTEYE GİT</button>
                </form>
            </body>
            </html>
        `);
    }

    // Kullanıcı protokol yazmadıysa otomatik ekle
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1024, height: 768 });

        // REKLAMLARI VE GEREKSİZ RESİMLERİ ENGELLEME (Sitenin PS3 için hızlı yüklenmesini sağlar)
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            if (
                url.includes('doubleclick') || 
                url.includes('adservice') || 
                url.includes('analytics') || 
                url.includes('adsense') ||
                url.includes('popunder')
            ) {
                request.abort(); // Reklam ağlarını engelle
            } else {
                request.continue();
            }
        });

        // Siteye git
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 40000 });

        // --- GELİŞMİŞ VİDEO YAKALAMA MOTORU ---
        // Sitedeki tüm ağ trafiğini dinleyerek arka plandaki gerçek video kaynaklarını (.mp4, .m3u8, stream linkleri) tarar
        const videoUrls = [];
        
        // Tarayıcı içinde çalışan JavaScript ile video elementlerini, kaynakları ve iframeleri tara
        const foundVideos = await page.evaluate(() => {
            let sources = [];
            // 1. Standart video etiketleri
            document.querySelectorAll('video').forEach(v => {
                if (v.src) sources.push(v.src);
                v.querySelectorAll('source').forEach(s => { if (s.src) sources.push(s.src); });
            });
            // 2. İframe içindeki video oynatıcıları (Dizi sitelerinin kullandığı kaynaklar)
            document.querySelectorAll('iframe').forEach(f => {
                if (f.src && (f.src.includes('video') || f.src.includes('player') || f.src.includes('stream') || f.src.includes('embed'))) {
                    sources.push(f.src);
                }
            });
            return sources;
        });

        // --- LİNK KOORDİNATLARINI ALMA ---
        const linkCoordinates = await page.evaluate(() => {
            const links = document.querySelectorAll('a');
            return Array.from(links).map(link => {
                const rect = link.getBoundingClientRect();
                return {
                    href: link.href,
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    right: Math.round(rect.right),
                    bottom: Math.round(rect.bottom)
                };
            }).filter(l => (l.right - l.left) > 0 && (l.bottom - l.top) > 0);
        });

        let mapAreasHtml = '';
        linkCoordinates.forEach((link, index) => {
            const proxyLink = `/?url=${encodeURIComponent(link.href)}`;
            mapAreasHtml += `<area shape="rect" coords="${link.left},${link.top},${link.right},${link.bottom}" href="${proxyLink}" alt="Link ${index}">\n`;
        });

        // Sayfa resmini çek
        const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');

        await browser.close();

        // --- ÇIKTI HTML OLUŞTURMA ---
        let outputHtml = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>PS3 Proxy: Evrensel Görünüm</title></head>
            <body style="background:#000; color:#fff; font-family:sans-serif; text-align:center; margin:0; padding:10px;">
                <div style="background:#222; padding:10px; margin-bottom:15px; border-bottom:2px solid #00ff00;">
                    <a href="/" style="color:#00ff00; font-size:18px; text-decoration:none; font-weight:bold;">[ ← YENİ SİTE ARA ]</a>
                    <span style="margin-left:20px; color:#aaa; font-size:14px;">Site: ${targetUrl}</span>
                </div>
        `;

        // Bulunan tüm olası video kaynaklarını PS3'ün tıklayıp açabileceği şekilde listele
        if (foundVideos.length > 0) {
            outputHtml += `
                <div style="background:#111; border:2px solid #ff0000; padding:10px; margin:20px auto; max-width:700px; text-align:left;">
                    <h3 style="color:#ff0000; margin-top:0; text-align:center;">📺 Sitede Bulunan Videolar / Oynatıcılar</h3>
                    <p style="font-size:13px; color:#aaa;">PS3 ana tarayıcısı oynatamazsa, aşağıdaki linklere tıklayarak videoyu doğrudan oynatmayı veya indirmeyi deneyin:</p>
                    <ul style="color:cyan;">
            `;
            foundVideos.forEach((vSrc, idx) => {
                outputHtml += `<li style="margin-bottom:10px;"><a href="${vSrc}" target="_blank" style="color:cyan; font-weight:bold; font-size:16px;">[ Oynatıcı Kaynağı #${idx + 1} ]</a></li>`;
            });
            outputHtml += `</ul></div>`;
        }

        outputHtml += `
                <div id="ps3-web-view" style="display:inline-block; margin-top:10px;">
                    <img src="data:image/jpeg;base64,${base64Image}" usemap="#web-page-map" alt="Sayfa Resmi" style="border:1px solid #444;" />
                    <map name="web-page-map">
                        ${mapAreasHtml}
                    </map>
                </div>
            </body>
            </html>
        `;

        res.send(outputHtml);

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).send(`<body style="background:#000; color:red; text-align:center; padding-top:50px;"><h2>⚠️ Hata: ${error.message}</h2><a href="/" style="color:#fff;">Geri Dön</a></body>`);
    }
});

app.listen(PORT, () => {
    console.log(`Evrensel PS3 Proxy ${PORT} portunda aktif.`);
});
