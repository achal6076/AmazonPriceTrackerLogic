import axios from 'axios';
import { load, type CheerioAPI } from 'cheerio';
import type { Pool } from 'pg';
import type { Transporter } from 'nodemailer';
import type { WhatsAppState } from '../../plugins/whatsapp';
import { checkAndSendAlerts } from '../alerts/alerts.service';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildHeaders() {
  return {
    'User-Agent': randomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };
}

export interface ScrapeResult {
  asin: string;
  title: string | null;
  price: number | null;
  currency: string;
  url: string;
  scraped_at: string;
}

function extractPrice($: CheerioAPI): number | null {
  const selectors = [
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    'span.a-price[data-a-color="price"] .a-offscreen',
    '.a-price .a-offscreen',
    '#apex_offerDisplay_desktop .a-price .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
  ];

  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (!text) continue;
    const cleaned = text.replace(/[₹$€£,\s]/g, '');
    const price = parseFloat(cleaned);
    if (!isNaN(price) && price > 0) return price;
  }

  // Fallback: whole + fraction
  const whole = $('span.a-price-whole').first().text().replace(/[,\.]/g, '').trim();
  const fraction = $('span.a-price-fraction').first().text().trim();
  if (whole) {
    const price = parseFloat(`${whole}.${fraction || '00'}`);
    if (!isNaN(price) && price > 0) return price;
  }

  return null;
}

function extractTitle($: CheerioAPI): string | null {
  const title = $('#productTitle').text().trim();
  return title || null;
}

function extractAsin(url: string): string | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isShortUrl(url: string): boolean {
  return /amzn\.(in|to|eu|com|asia)/i.test(url);
}

async function resolveShortUrl(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: buildHeaders(),
      timeout: 15000,
      maxRedirects: 10,
      // capture the final URL after all redirects
    });
    return response.request?.res?.responseUrl ?? response.config?.url ?? url;
  } catch (err: any) {
    // axios throws on non-2xx but still gives us the redirect chain
    if (err.request?.res?.responseUrl) return err.request.res.responseUrl;
    throw Object.assign(new Error('Could not resolve short URL — check your internet connection and try again'), { statusCode: 400 });
  }
}

export async function scrapeProduct(rawUrl: string): Promise<ScrapeResult> {
  let url = normalizeUrl(rawUrl);

  // Resolve amzn.in / amzn.to short links to the full product URL first
  if (isShortUrl(url)) {
    url = await resolveShortUrl(url);
  }

  const asin = extractAsin(url);
  if (!asin) throw Object.assign(new Error('Could not extract ASIN from URL. Make sure the link points to an Amazon product page.'), { statusCode: 400 });

  const cleanUrl = `https://www.amazon.in/dp/${asin}`;

  const scraperApiKey = process.env.SCRAPER_API_KEY;
  const fetchUrl = scraperApiKey
    ? `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(cleanUrl)}&country_code=in`
    : cleanUrl;

  const response = await axios.get(fetchUrl, {
    headers: scraperApiKey ? {} : buildHeaders(),
    timeout: 60000,
    maxRedirects: 5,
  });

  if (response.status !== 200) {
    throw Object.assign(new Error('Failed to fetch product page'), { statusCode: 502 });
  }

  const $ = load(response.data);

  // Detect captcha / bot block
  if ($('form[action="/errors/validateCaptcha"]').length || $('title').text().includes('Robot Check')) {
    throw Object.assign(new Error('Amazon blocked the request (captcha). Try again later.'), { statusCode: 429 });
  }

  const price = extractPrice($);
  const title = extractTitle($);

  return {
    asin,
    title,
    price,
    currency: 'INR',
    url: cleanUrl,
    scraped_at: new Date().toISOString(),
  };
}

export async function scrapeAndStore(db: Pool, productId: string, mailer?: Transporter, whatsapp?: WhatsAppState): Promise<ScrapeResult> {
  const productResult = await db.query('SELECT id, url, asin FROM products WHERE id = $1', [productId]);
  const product = productResult.rows[0];
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

  const result = await scrapeProduct(product.url);

  if (result.price !== null) {
    await db.query(
      'INSERT INTO product_price_history (product_id, price, currency) VALUES ($1, $2, $3)',
      [productId, result.price, result.currency],
    );

    await db.query('UPDATE products SET updated_at = NOW() WHERE id = $1', [productId]);

    if (mailer) {
      await checkAndSendAlerts(db, mailer, productId, result.price, whatsapp);
    }
  }

  return result;
}

export async function scrapeAllTrackedProducts(db: Pool, mailer?: Transporter, whatsapp?: WhatsAppState): Promise<{ success: number; failed: number }> {
  const result = await db.query(
    `SELECT DISTINCT p.id, p.url
     FROM products p
     JOIN tracked_products tp ON tp.product_id = p.id
     WHERE tp.is_active = TRUE`,
  );

  let success = 0;
  let failed = 0;

  for (const product of result.rows) {
    try {
      await scrapeAndStore(db, product.id, mailer, whatsapp);
      success++;
      // Small delay between requests to avoid rate limiting
      await new Promise(res => setTimeout(res, 2000 + Math.random() * 2000));
    } catch {
      failed++;
    }
  }

  return { success, failed };
}
