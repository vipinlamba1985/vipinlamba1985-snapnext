import { NextResponse } from 'next/server';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    storageGb: 15,
    description: 'Start your private memory home with basic backup and AI previews.',
    features: ['15 GB secure vault', 'Basic backup', 'Limited AI captions'],
  },
  {
    id: 'plus',
    name: 'Plus',
    price: 4.99,
    storageGb: 100,
    description: 'More space for everyday memories and stronger AI tools.',
    features: ['100 GB secure vault', 'AI captions', 'Stories', 'Priority uploads'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9.99,
    storageGb: 1000,
    description: 'For creators and families with large photo and video libraries.',
    features: ['1 TB secure vault', 'Advanced AI stories', 'Bulk downloads', 'Favorite people sync'],
  },
  {
    id: 'family',
    name: 'Family',
    price: 14.99,
    storageGb: 2000,
    description: 'Shared private memory spaces for your favorite people.',
    features: ['2 TB family vault', 'Family sharing', 'People sync', 'Community albums'],
  },
];

export async function GET() {
  return NextResponse.json({ plans });
}
