'use client';

export async function runConcurrent(rows, limit, worker) {
  let cursor = 0;
  async function next() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await worker(row);
    }
  }
  const workers = Math.min(Math.max(1, limit), rows.length);
  await Promise.all(Array.from({ length: workers }, () => next()));
}
