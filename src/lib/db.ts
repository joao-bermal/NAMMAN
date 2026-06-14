import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export interface UserSettings {
  downloadDir: string;
}

export interface UserData {
  id: string;
  username: string;
  passwordHash: string;
  settings: UserSettings;
  favorites: number[];
  downloads: number[];
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function createUser(username: string, passwordHash: string): Promise<UserData> {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new Error('User already exists');
  }
  
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
    }
  });
  
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.passwordHash,
    settings: { downloadDir: '' },
    favorites: [],
    downloads: []
  };
}

export async function getUserData(username: string): Promise<UserData | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      favorites: true,
      downloads: true
    }
  });
  
  if (!user) return null;
  
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.passwordHash,
    settings: { downloadDir: '' },
    favorites: user.favorites.map(f => f.toneId),
    downloads: user.downloads.map(d => d.toneId)
  };
}

export async function toggleFavorite(username: string, toneId: number): Promise<UserData> {
  const user = await prisma.user.findUnique({ where: { username }, include: { favorites: true } });
  if (!user) throw new Error("User not found");
  
  const existingFav = user.favorites.find(f => f.toneId === toneId);
  
  if (existingFav) {
    await prisma.favorite.delete({ where: { id: existingFav.id } });
  } else {
    await prisma.favorite.create({
      data: {
        toneId,
        userId: user.id
      }
    });
  }
  
  return (await getUserData(username)) as UserData;
}

export async function markAsDownloaded(username: string, toneId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { username }, include: { downloads: true } });
  if (!user) throw new Error("User not found");
  
  const existingDownload = user.downloads.find(d => d.toneId === toneId);
  if (!existingDownload) {
    await prisma.download.create({
      data: {
        toneId,
        userId: user.id
      }
    });
  }
}

export async function updateUserSettings(username: string, settings: Partial<UserSettings>): Promise<UserData> {
  // Settings are not currently persisted in Supabase in this minimal schema
  return (await getUserData(username)) as UserData;
}
