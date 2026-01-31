/**
 * Generate embeddings for stock image descriptions.
 *
 * Usage: npx tsx scripts/generate-embeddings.ts
 *
 * Reads public/stock/manifest.json, generates an embedding for each image's
 * description using OpenAI text-embedding-3-small, and writes the embeddings
 * back into the manifest file.
 *
 * Requires OPENAI_API_KEY environment variable (reads from .env.local).
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// Load .env.local for the API key
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        process.env[key] = value;
      }
    }
  }
}

const MANIFEST_PATH = path.resolve(__dirname, '..', 'public', 'stock', 'manifest.json');

interface StockImage {
  id: string;
  filename: string;
  description: string;
  tags: string[];
  embedding: number[];
}

interface Manifest {
  fallbackImageId: string;
  images: StockImage[];
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not found. Set it in .env.local or environment.');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Read manifest
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  const manifest: Manifest = JSON.parse(raw);

  console.log(`Found ${manifest.images.length} images in manifest.`);

  // Collect descriptions that need embeddings
  const needsEmbedding = manifest.images.filter(img => !img.embedding || img.embedding.length === 0);

  if (needsEmbedding.length === 0) {
    console.log('All images already have embeddings. Use --force to regenerate.');
    if (!process.argv.includes('--force')) return;
    // If --force, regenerate all
    needsEmbedding.push(...manifest.images);
  }

  console.log(`Generating embeddings for ${needsEmbedding.length} images...`);

  // Batch all descriptions in a single API call (cheaper and faster)
  const descriptions = needsEmbedding.map(img => `${img.description} ${img.tags.join(' ')}`);

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: descriptions,
  });

  // Map embeddings back to images
  for (let i = 0; i < needsEmbedding.length; i++) {
    needsEmbedding[i].embedding = response.data[i].embedding;
    console.log(`  ✓ ${needsEmbedding[i].id}`);
  }

  // Write back to manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nDone! Wrote embeddings to ${MANIFEST_PATH}`);
  console.log(`Cost: ~$${(descriptions.length * 0.00002).toFixed(4)} (text-embedding-3-small)`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
