import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_FILE = path.join(process.cwd(), 'db.json');

export interface UserSettings {
  downloadDir: string;
}

export interface UserData {
  passwordHash: string;
  settings: UserSettings;
  favorites: number[];
  downloads: number[];
}

export interface Database {
  users: {
    [username: string]: UserData;
  };
}

const DEFAULT_DB: Database = {
  users: {}
};

async function readDB(): Promise<Database> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await writeDB(DEFAULT_DB);
      return DEFAULT_DB;
    }
    throw error;
  }
}

async function writeDB(data: Database): Promise<void> {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function createUser(username: string, passwordHash: string): Promise<UserData> {
  const db = await readDB();
  if (db.users[username]) {
    throw new Error('User already exists');
  }
  
  db.users[username] = {
    passwordHash,
    settings: { downloadDir: '' },
    favorites: [],
    downloads: []
  };
  
  await writeDB(db);
  return db.users[username];
}

export async function getUserData(username: string): Promise<UserData | null> {
  const db = await readDB();
  return db.users[username] || null;
}

export async function toggleFavorite(username: string, toneId: number): Promise<UserData> {
  const db = await readDB();
  if (!db.users[username]) throw new Error("User not found");
  
  const user = db.users[username];
  const index = user.favorites.indexOf(toneId);
  if (index === -1) {
    user.favorites.push(toneId);
  } else {
    user.favorites.splice(index, 1);
  }
  await writeDB(db);
  return user;
}

export async function markAsDownloaded(username: string, toneId: number): Promise<void> {
  const db = await readDB();
  if (!db.users[username]) throw new Error("User not found");
  
  const user = db.users[username];
  if (!user.downloads.includes(toneId)) {
    user.downloads.push(toneId);
    await writeDB(db);
  }
}

export async function updateUserSettings(username: string, settings: Partial<UserSettings>): Promise<UserData> {
  const db = await readDB();
  if (!db.users[username]) throw new Error("User not found");
  
  db.users[username].settings = {
    ...db.users[username].settings,
    ...settings
  };
  
  await writeDB(db);
  return db.users[username];
}
