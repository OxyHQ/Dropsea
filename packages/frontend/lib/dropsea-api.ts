/**
 * Dropsea's backend (packages/backend), called with the person's Oxy session: a
 * linked client keeps its bearer token in step with that session and hands a
 * 401 back to it to refresh.
 */
import type {
  AddAlbumItemsResponse,
  Album,
  AlbumItemsPage,
  ChangeFileTagsRequest,
  CreateAlbumRequest,
  FileTagName,
  FileTagNamesResponse,
  FileTagsByAsset,
  FileTagsCountResponse,
  FileTagsResponse,
  ForgetFileTagsRequest,
  LookupFileTagsRequest,
  RemoveFileTagNameRequest,
  RenameFileTagRequest,
  TaggedAssetsPage,
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

/** The tags of each asset, in each one's order; an asset without tags is left out. */
export async function lookupFileTags(assetIds: readonly string[]): Promise<FileTagsByAsset> {
  const request: LookupFileTagsRequest = { assetIds: [...assetIds] };
  const response = await backend.post<FileTagsResponse>('/file-tags/lookup', request);
  return response.tags;
}

/** A page of the person's assets with a tag (case aside), most recently tagged first. */
export async function listTaggedAssets(
  name: string,
  cursor: string | null,
): Promise<TaggedAssetsPage> {
  return backend.get<TaggedAssetsPage>('/file-tags', {
    params: { name, ...(cursor ? { cursor } : {}) },
  });
}

/** Every tag on the person's assets, and how many carry it. */
export async function listFileTagNames(): Promise<FileTagName[]> {
  const response = await backend.get<FileTagNamesResponse>('/file-tags/names');
  return response.names;
}

/** Takes `remove` off assets, then puts `add` on them; each asset's tags after. */
export async function changeFileTags(
  assetIds: readonly string[],
  add: readonly string[],
  remove: readonly string[],
): Promise<FileTagsByAsset> {
  const request: ChangeFileTagsRequest = {
    assetIds: [...assetIds],
    add: [...add],
    remove: [...remove],
  };
  const response = await backend.post<FileTagsResponse>('/file-tags/change', request);
  return response.tags;
}

/** Renames a tag on every asset that has it. */
export async function renameFileTag(from: string, to: string): Promise<void> {
  const request: RenameFileTagRequest = { from, to };
  await backend.post<FileTagsCountResponse>('/file-tags/rename', request);
}

/** Takes a tag off every asset that has it. */
export async function removeFileTag(name: string): Promise<void> {
  const request: RemoveFileTagNameRequest = { name };
  await backend.post<FileTagsCountResponse>('/file-tags/remove-name', request);
}

/** Forgets the tags of assets deleted for good. */
export async function forgetFileTags(assetIds: readonly string[]): Promise<void> {
  const request: ForgetFileTagsRequest = { assetIds: [...assetIds] };
  await backend.post<FileTagsCountResponse>('/file-tags/forget', request);
}
