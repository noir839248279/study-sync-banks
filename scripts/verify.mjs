import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateCatalog, cleanQuestions, checkBankSummary, CATALOG_LIMIT } from '../schema/bank.ts';
const bytes = await readFile(new URL('../catalog.json',import.meta.url));
if (bytes.length > CATALOG_LIMIT) throw Error('Catalog too large');
const catalog = validateCatalog(JSON.parse(bytes));
for (const bank of catalog.banks) {
  const data = await readFile(new URL('../'+bank.path,import.meta.url));
  if (data.length !== bank.bytes || createHash('sha256').update(data).digest('hex') !== bank.sha256) throw Error('Bank integrity mismatch');
  checkBankSummary(bank,cleanQuestions(JSON.parse(data)));
}
console.log(`Validated ${catalog.banks.length} published banks`);
