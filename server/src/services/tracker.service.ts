/**
 * Tracker Service
 *
 * Integration with external tracking services like AniList and MyAnimeList.
 * Allows syncing reading progress and status with external platforms.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export type TrackerService = 'anilist' | 'myanimelist' | 'kitsu';

export type MediaStatus = 'reading' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_read';

export interface TrackerConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

export interface TrackerUser {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface TrackerManga {
  id: string;
  title: string;
  titleEnglish?: string;
  coverImage?: string;
  chapters?: number;
  volumes?: number;
  status?: string;
  averageScore?: number;
  description?: string;
}

export interface TrackerEntry {
  id: string;
  mangaId: string;
  status: MediaStatus;
  progress: number; // Chapters read
  progressVolumes?: number;
  score?: number; // 1-10 or 1-100 depending on service
  startedAt?: Date;
  completedAt?: Date;
}

export interface TrackerToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// =============================================================================
// AniList Integration
// =============================================================================

const ANILIST_API = 'https://graphql.anilist.co';

export async function anilistGetAuthUrl(config: TrackerConfig): Promise<string> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
  });

  return `https://anilist.co/api/v2/oauth/authorize?${params}`;
}

export async function anilistExchangeCode(
  code: string,
  config: TrackerConfig
): Promise<TrackerToken> {
  const response = await fetch('https://anilist.co/api/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange AniList code');
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function anilistGetUser(accessToken: string): Promise<TrackerUser> {
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          medium
        }
      }
    }
  `;

  const response = await anilistGraphQL(query, {}, accessToken);

  return {
    id: String(response.Viewer.id),
    username: response.Viewer.name,
    avatarUrl: response.Viewer.avatar?.medium,
  };
}

export async function anilistSearchManga(
  query: string,
  accessToken: string
): Promise<TrackerManga[]> {
  const gql = `
    query ($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: MANGA) {
          id
          title {
            romaji
            english
          }
          coverImage {
            medium
          }
          chapters
          volumes
          status
          averageScore
          description
        }
      }
    }
  `;

  const response = await anilistGraphQL(gql, { search: query }, accessToken);

  return response.Page.media.map((m: any) => ({
    id: String(m.id),
    title: m.title.romaji,
    titleEnglish: m.title.english,
    coverImage: m.coverImage?.medium,
    chapters: m.chapters,
    volumes: m.volumes,
    status: m.status,
    averageScore: m.averageScore,
    description: m.description,
  }));
}

export async function anilistGetEntry(
  mangaId: string,
  accessToken: string
): Promise<TrackerEntry | null> {
  const query = `
    query ($mediaId: Int) {
      MediaList(mediaId: $mediaId, type: MANGA) {
        id
        status
        progress
        progressVolumes
        score(format: POINT_10)
        startedAt {
          year
          month
          day
        }
        completedAt {
          year
          month
          day
        }
      }
    }
  `;

  try {
    const response = await anilistGraphQL(query, { mediaId: parseInt(mangaId) }, accessToken);

    if (!response.MediaList) {
      return null;
    }

    const entry = response.MediaList;

    return {
      id: String(entry.id),
      mangaId,
      status: mapAniListStatus(entry.status),
      progress: entry.progress || 0,
      progressVolumes: entry.progressVolumes,
      score: entry.score,
      startedAt: parseAniListDate(entry.startedAt),
      completedAt: parseAniListDate(entry.completedAt),
    };
  } catch {
    return null;
  }
}

export async function anilistUpdateEntry(
  mangaId: string,
  updates: Partial<TrackerEntry>,
  accessToken: string
): Promise<TrackerEntry> {
  const mutation = `
    mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $progressVolumes: Int, $score: Float, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, progressVolumes: $progressVolumes, score: $score, startedAt: $startedAt, completedAt: $completedAt) {
        id
        status
        progress
        progressVolumes
        score(format: POINT_10)
        startedAt {
          year
          month
          day
        }
        completedAt {
          year
          month
          day
        }
      }
    }
  `;

  const variables: any = {
    mediaId: parseInt(mangaId),
  };

  if (updates.status) {
    variables.status = mapStatusToAniList(updates.status);
  }
  if (updates.progress !== undefined) {
    variables.progress = updates.progress;
  }
  if (updates.progressVolumes !== undefined) {
    variables.progressVolumes = updates.progressVolumes;
  }
  if (updates.score !== undefined) {
    variables.score = updates.score;
  }
  if (updates.startedAt) {
    variables.startedAt = formatAniListDate(updates.startedAt);
  }
  if (updates.completedAt) {
    variables.completedAt = formatAniListDate(updates.completedAt);
  }

  const response = await anilistGraphQL(mutation, variables, accessToken);
  const entry = response.SaveMediaListEntry;

  return {
    id: String(entry.id),
    mangaId,
    status: mapAniListStatus(entry.status),
    progress: entry.progress || 0,
    progressVolumes: entry.progressVolumes,
    score: entry.score,
    startedAt: parseAniListDate(entry.startedAt),
    completedAt: parseAniListDate(entry.completedAt),
  };
}

async function anilistGraphQL(query: string, variables: object, accessToken: string): Promise<any> {
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json() as {
    data?: any;
    errors?: Array<{ message: string }>;
  };

  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'AniList API error');
  }

  return data.data;
}

function mapAniListStatus(status: string): MediaStatus {
  const map: Record<string, MediaStatus> = {
    CURRENT: 'reading',
    COMPLETED: 'completed',
    PAUSED: 'on_hold',
    DROPPED: 'dropped',
    PLANNING: 'plan_to_read',
  };
  return map[status] || 'reading';
}

function mapStatusToAniList(status: MediaStatus): string {
  const map: Record<MediaStatus, string> = {
    reading: 'CURRENT',
    completed: 'COMPLETED',
    on_hold: 'PAUSED',
    dropped: 'DROPPED',
    plan_to_read: 'PLANNING',
  };
  return map[status];
}

function parseAniListDate(date: { year?: number; month?: number; day?: number } | null): Date | undefined {
  if (!date || !date.year) return undefined;
  return new Date(date.year, (date.month || 1) - 1, date.day || 1);
}

function formatAniListDate(date: Date): { year: number; month: number; day: number } {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

// =============================================================================
// MyAnimeList Integration
// =============================================================================

const MAL_API = 'https://api.myanimelist.net/v2';

export async function malGetAuthUrl(config: TrackerConfig): Promise<string> {
  // Generate PKCE code verifier and challenge
  const codeVerifier = generateCodeVerifier();

  // Store code verifier (would normally be in session)
  // For now, we'll use the verifier as the state too

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    code_challenge: codeVerifier, // MAL uses plain code challenge
    code_challenge_method: 'plain',
    state: codeVerifier,
  });

  return `https://myanimelist.net/v1/oauth2/authorize?${params}`;
}

export async function malExchangeCode(
  code: string,
  codeVerifier: string,
  config: TrackerConfig
): Promise<TrackerToken> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!response.ok) {
    throw new Error('Failed to exchange MAL code');
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function malRefreshToken(
  refreshToken: string,
  config: TrackerConfig
): Promise<TrackerToken> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!response.ok) {
    throw new Error('Failed to refresh MAL token');
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function malGetUser(accessToken: string): Promise<TrackerUser> {
  const response = await fetch(`${MAL_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get MAL user');
  }

  const data = await response.json() as {
    id: number;
    name: string;
    picture?: string;
  };

  return {
    id: String(data.id),
    username: data.name,
    avatarUrl: data.picture,
  };
}

export async function malSearchManga(
  query: string,
  accessToken: string
): Promise<TrackerManga[]> {
  const params = new URLSearchParams({
    q: query,
    limit: '10',
    fields: 'id,title,main_picture,num_chapters,num_volumes,status,mean,synopsis',
  });

  const response = await fetch(`${MAL_API}/manga?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to search MAL manga');
  }

  interface MALMangaItem {
    node: {
      id: number;
      title: string;
      main_picture?: { medium?: string };
      num_chapters?: number;
      num_volumes?: number;
      status?: string;
      mean?: number;
      synopsis?: string;
    };
  }

  const data = await response.json() as { data: MALMangaItem[] };

  return data.data.map((item) => ({
    id: String(item.node.id),
    title: item.node.title,
    coverImage: item.node.main_picture?.medium,
    chapters: item.node.num_chapters,
    volumes: item.node.num_volumes,
    status: item.node.status,
    averageScore: item.node.mean ? Math.round(item.node.mean * 10) : undefined,
    description: item.node.synopsis,
  }));
}

export async function malGetEntry(
  mangaId: string,
  accessToken: string
): Promise<TrackerEntry | null> {
  const params = new URLSearchParams({
    fields: 'my_list_status{status,num_chapters_read,num_volumes_read,score,start_date,finish_date}',
  });

  const response = await fetch(`${MAL_API}/manga/${mangaId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  interface MALListStatus {
    status: string;
    num_chapters_read?: number;
    num_volumes_read?: number;
    score?: number;
    start_date?: string;
    finish_date?: string;
  }

  const data = await response.json() as { my_list_status?: MALListStatus };

  if (!data.my_list_status) {
    return null;
  }

  const status = data.my_list_status;

  return {
    id: mangaId,
    mangaId,
    status: mapMALStatus(status.status),
    progress: status.num_chapters_read || 0,
    progressVolumes: status.num_volumes_read,
    score: status.score,
    startedAt: status.start_date ? new Date(status.start_date) : undefined,
    completedAt: status.finish_date ? new Date(status.finish_date) : undefined,
  };
}

export async function malUpdateEntry(
  mangaId: string,
  updates: Partial<TrackerEntry>,
  accessToken: string
): Promise<TrackerEntry> {
  const params = new URLSearchParams();

  if (updates.status) {
    params.append('status', mapStatusToMAL(updates.status));
  }
  if (updates.progress !== undefined) {
    params.append('num_chapters_read', String(updates.progress));
  }
  if (updates.progressVolumes !== undefined) {
    params.append('num_volumes_read', String(updates.progressVolumes));
  }
  if (updates.score !== undefined) {
    params.append('score', String(updates.score));
  }
  if (updates.startedAt) {
    params.append('start_date', updates.startedAt.toISOString().split('T')[0]!);
  }
  if (updates.completedAt) {
    params.append('finish_date', updates.completedAt.toISOString().split('T')[0]!);
  }

  const response = await fetch(`${MAL_API}/manga/${mangaId}/my_list_status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error('Failed to update MAL entry');
  }

  interface MALUpdateResponse {
    status: string;
    num_chapters_read?: number;
    num_volumes_read?: number;
    score?: number;
    start_date?: string;
    finish_date?: string;
  }

  const data = await response.json() as MALUpdateResponse;

  return {
    id: mangaId,
    mangaId,
    status: mapMALStatus(data.status),
    progress: data.num_chapters_read || 0,
    progressVolumes: data.num_volumes_read,
    score: data.score,
    startedAt: data.start_date ? new Date(data.start_date) : undefined,
    completedAt: data.finish_date ? new Date(data.finish_date) : undefined,
  };
}

function mapMALStatus(status: string): MediaStatus {
  const map: Record<string, MediaStatus> = {
    reading: 'reading',
    completed: 'completed',
    on_hold: 'on_hold',
    dropped: 'dropped',
    plan_to_read: 'plan_to_read',
  };
  return map[status] || 'reading';
}

function mapStatusToMAL(status: MediaStatus): string {
  return status;
}

function generateCodeVerifier(): string {
  // SECURITY: Use cryptographically secure random bytes for PKCE code verifier
  // RFC 7636 requires 43-128 characters from unreserved URI characters
  // base64url encoding of 64 bytes gives us 86 characters, which is within spec
  return crypto.randomBytes(64).toString('base64url');
}

// =============================================================================
// Database Operations
// =============================================================================

export async function saveTrackerToken(
  userId: string,
  service: TrackerService,
  token: TrackerToken
): Promise<void> {
  await prisma.trackerToken.upsert({
    where: { userId_service: { userId, service } },
    create: {
      userId,
      service,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    },
    update: {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    },
  });
}

export async function getTrackerToken(
  userId: string,
  service: TrackerService
): Promise<TrackerToken | null> {
  const token = await prisma.trackerToken.findUnique({
    where: { userId_service: { userId, service } },
  });

  if (!token) {
    return null;
  }

  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || undefined,
    expiresAt: token.expiresAt || undefined,
  };
}

export async function deleteTrackerToken(userId: string, service: TrackerService): Promise<void> {
  await prisma.trackerToken.deleteMany({
    where: { userId, service },
  });
}

export async function getTrackerMapping(
  series: string,
  service: TrackerService
): Promise<{ externalId: string; externalTitle: string | null } | null> {
  const mapping = await prisma.trackerMapping.findUnique({
    where: { series_service: { series, service } },
  });

  if (!mapping) {
    return null;
  }

  return {
    externalId: mapping.externalId,
    externalTitle: mapping.externalTitle,
  };
}

export async function setTrackerMapping(
  series: string,
  service: TrackerService,
  externalId: string,
  externalTitle?: string
): Promise<void> {
  await prisma.trackerMapping.upsert({
    where: { series_service: { series, service } },
    create: {
      series,
      service,
      externalId,
      externalTitle,
    },
    update: {
      externalId,
      externalTitle,
    },
  });
}

export async function deleteTrackerMapping(series: string, service: TrackerService): Promise<void> {
  await prisma.trackerMapping.deleteMany({
    where: { series, service },
  });
}
