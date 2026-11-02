/**
 * Dropsea's backend (packages/backend), called with the person's Oxy session: a
 * linked client keeps its bearer token in step with that session and hands a
 * 401 back to it to refresh.
 */
import type {
  AddAlbumItemsResponse,
  Album,
  AlbumItemsPage,
  CreateAlbumRequest,
  UpdateAlbumRequest,
} from '@dropsea/shared-types';
import { DROPSEA_API_URL } from '@/lib/config';
import { oxyServices } from '@/lib/oxy';

const backend = oxyServices.createLinkedClient({ baseURL: DROPSEA_API_URL }).client;

/** Photos per page of an album. */
export const ALBUM_PAGE_SIZE = 120;

export async function listAlbums(): Promise<Album[]> {
  const response = await backend.get<{ albums: Album[] }>('/albums');
  return response.albums;
}

export async function getAlbum(albumId: string): Promise<Album> {
  const response = await backend.get<{ album: Album }>(`/albums/${encodeURIComponent(albumId)}`);
  return response.album;
}

export async function createAlbum(request: CreateAlbumRequest): Promise<Album> {
  const response = await backend.post<{ album: Album }>('/albums', request);
  return response.album;
}

export async function updateAlbum(albumId: string, request: UpdateAlbumRequest): Promise<Album> {
  const response = await backend.patch<{ album: Album }>(
    `/albums/${encodeURIComponent(albumId)}`,
    request,
  );
  return response.album;
}

export async function deleteAlbum(albumId: string): Promise<void> {
  await backend.delete(`/albums/${encodeURIComponent(albumId)}`);
}

export async function listAlbumItems(
  albumId: string,
  cursor: string | null,
): Promise<AlbumItemsPage> {
  return backend.get<AlbumItemsPage>(`/albums/${encodeURIComponent(albumId)}/items`, {
    params: { limit: ALBUM_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  });
}

export async function addAlbumItems(
  albumId: string,
  assetIds: readonly string[],
): Promise<AddAlbumItemsResponse> {
  return backend.post<AddAlbumItemsResponse>(`/albums/${encodeURIComponent(albumId)}/items`, {
    assetIds,
  });
}

export async function removeAlbumItem(albumId: string, itemId: string): Promise<void> {
  await backend.delete(
    `/albums/${encodeURIComponent(albumId)}/items/${encodeURIComponent(itemId)}`,
  );
}
