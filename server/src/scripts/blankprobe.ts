/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

import { extractFromImage } from '../modules/receipts/receipt.extract';

async function main() {
  const blank = `data:image/png;base64,${fs
    .readFileSync(path.join(__dirname, 'fixtures', 'blank.png'))
    .toString('base64')}`;
  const result = await extractFromImage(blank, 'Asia/Kolkata');
  console.log(
    JSON.stringify(
      {
        merchant: result.merchant,
        amount: result.amount,
        amountText: result.amountText,
        date: result.date,
        items: result.items.length,
        confidence: result.confidence,
      },
      null,
      2,
    ),
  );
}

void main().catch((e: unknown) => {
  console.error('failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
