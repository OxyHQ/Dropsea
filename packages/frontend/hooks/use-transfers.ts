import type { AssetUploadInput } from '@oxy.so/core';
import { toast } from '@oxy.so/bloom/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { cloudFilesKey } from '@/hooks/use-cloud-files';
import { useLocale } from '@/hooks/use-locale';
import { useViewer } from '@/hooks/use-viewer';
import { refreshFolder } from '@/lib/folder-store';
import { formatPercent } from '@/lib/format';
import type { LocalItem } from '@/lib/items';
import { mimeForName } from '@/lib/kinds';
import { downloadInto, hasLocalFiles, listFolder } from '@/lib/local-files';
import { oxyServices } from '@/lib/oxy';
import { type Downloadable, overallProgress, planDownloads, planUploads } from '@/lib/transfers';

/** One file to upload, and what the person is told it is called. */
interface Upload {
  input: AssetUploadInput;
  name: string;
  size: number | null;
}

/** Uploads at once: enough to keep a connection busy, few enough that each shows progress. */
const UPLOAD_CONCURRENCY = 3;

let transferNumber = 0;

/**
 * Moving files between this device and Oxy Files, with their progress in one
 * toast per transfer: uploading what is on the device (or what the person
 * picks, where Dropsea cannot browse the device), and downloading into a folder
 * here without replacing anything there.
 */
export function useTransfers() {
  const queryClient = useQueryClient();
  const { strings, locale } = useLocale();
  const { userId } = useViewer();

  /** Uploads files, returning the asset ids of those that went up, in their order. */
  const upload = async (uploads: readonly Upload[]): Promise<string[]> => {
    if (uploads.length === 0) return [];
    transferNumber++;
    const toastId = `upload-${transferNumber}`;
    const progress = uploads.map((item) => ({ fraction: 0, size: item.size }));
    let shownPercent = '';
    const show = () => {
      const percent = formatPercent(overallProgress(progress), locale);
      if (percent === shownPercent) return;
      shownPercent = percent;
      toast.loading(strings.transfers.uploading(uploads.length, percent), { id: toastId });
    };
    show();
    const assetIds: (string | null)[] = uploads.map(() => null);
    let next = 0;
    const worker = async () => {
      while (next < uploads.length) {
        const index = next++;
        const item = uploads[index];
        const state = progress[index];
        if (!item || !state) continue;
        try {
          const uploaded = await oxyServices.assets.upload(item.input, {
            onProgress: (percent) => {
              state.fraction = percent / 100;
              show();
            },
          });
          state.fraction = 1;
          assetIds[index] = uploaded.file.id;
        } catch (error) {
          console.warn('Dropsea could not upload a file to Oxy Files', { name: item.name, error });
          state.fraction = 1;
          toast.error(strings.transfers.uploadFailed(item.name));
        }
        show();
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploads.length) }, worker));
    const uploaded = assetIds.filter((assetId): assetId is string => assetId !== null);
    if (uploaded.length > 0)
      toast.success(strings.transfers.uploaded(uploaded.length), { id: toastId });
    else toast.dismiss(toastId);
    await queryClient.invalidateQueries({ queryKey: cloudFilesKey(userId) });
    return uploaded;
  };

  return {
    /** This device's files up to Oxy Files; folders are left out, and said so. */
    async uploadLocal(items: readonly LocalItem[]): Promise<string[]> {
      const plan = planUploads(items);
      if (plan.skippedFolders.length > 0) {
        toast.info(strings.transfers.skippedFolders(plan.skippedFolders.length));
      }
      return upload(
        plan.uploads.map((source) => ({
          input: source,
          name: source.name,
          size: source.size ?? null,
        })),
      );
    },

    /** Files the person picks with the system's picker, where Dropsea cannot browse the device. */
    async uploadPicked(): Promise<string[]> {
      // Loaded when used: a platform whose files Dropsea browses never asks for the picker.
      const { getDocumentAsync } = await import('expo-document-picker');
      const picked = await getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return [];
      return upload(
        picked.assets.map((asset) => ({
          input: asset.file ?? {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType ?? mimeForName(asset.name),
            ...(asset.size === undefined ? {} : { size: asset.size }),
          },
          name: asset.name,
          size: asset.size ?? null,
        })),
      );
    },

    /**
     * Oxy Files items into a folder on this device, each under a name free
     * there. Where Dropsea has no files on this device, the system opens each
     * file's address instead (a browser downloads or shows it).
     */
    async download(items: readonly Downloadable[], folder: { uri: string; name: string } | null) {
      if (items.length === 0) return;
      if (!folder || !hasLocalFiles()) {
        for (const item of items) {
          try {
            await Linking.openURL(await oxyServices.assets.url(item.assetId));
          } catch (error) {
            console.warn('Dropsea could not open a file from Oxy Files', {
              assetId: item.assetId,
              error,
            });
            toast.error(strings.transfers.downloadFailed(item.name));
          }
        }
        return;
      }
      transferNumber++;
      const toastId = `download-${transferNumber}`;
      const steps = planDownloads(
        items,
        listFolder(folder.uri).map((entry) => entry.name),
      );
      const progress = items.map((item) => ({ fraction: 0, size: item.size }));
      let shownPercent = '';
      const show = () => {
        const percent = formatPercent(overallProgress(progress), locale);
        if (percent === shownPercent) return;
        shownPercent = percent;
        toast.loading(strings.transfers.downloading(items.length, percent), { id: toastId });
      };
      show();
      let downloaded = 0;
      for (const [index, step] of steps.entries()) {
        const state = progress[index];
        try {
          const url = await oxyServices.assets.url(step.assetId);
          await downloadInto(url, folder.uri, step.fileName, (fraction) => {
            if (state) state.fraction = fraction;
            show();
          });
          downloaded++;
        } catch (error) {
          console.warn('Dropsea could not download a file from Oxy Files', { step, error });
          toast.error(strings.transfers.downloadFailed(items[index]?.name ?? step.fileName));
        }
        if (state) state.fraction = 1;
        show();
      }
      refreshFolder(folder.uri);
      if (downloaded > 0) {
        toast.success(strings.transfers.downloaded(downloaded, folder.name), { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    },
  };
}
