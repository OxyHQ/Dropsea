import { type PlatformFileChooser, usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { useLocalPlaces } from '@/hooks/use-local-places';
import { startFolder } from '@/lib/chooser';
import { rememberedFolder } from '@/lib/chooser-answer';
import { folderExists } from '@/lib/local-files';
import type { LocalPlace } from '@/lib/local-places';
import { hrefFor } from '@/lib/routes';

/**
 * Where a window opens: the person's home (or this device's folder) where
 * Dropsea has files on this device, else Oxy Files. As the file chooser, where
 * its panel starts (`startFolder`).
 */
export default function Start() {
  const chooser = usePlatformFiles()?.chooser ?? null;
  const { places, isLoading } = useLocalPlaces();
  if (isLoading) return null;
  if (chooser) return <ChooserStart chooser={chooser} places={places} />;
  const start = places.find((place) => place.kind === 'home') ?? places[0];
  return (
    <Redirect href={hrefFor(start ? { kind: 'folder', uri: start.uri } : { kind: 'cloud' })} />
  );
}

/** The panel's first folder, once Dropsea has read the one it keeps for the asking application. */
function ChooserStart({
  chooser,
  places,
}: {
  chooser: PlatformFileChooser;
  places: readonly LocalPlace[];
}) {
  const applicationId = chooser.request.application?.id ?? null;
  const [remembered, setRemembered] = useState<{ folder: string | null } | null>(
    applicationId ? null : { folder: null },
  );
  useEffect(() => {
    if (!applicationId) return undefined;
    let ignore = false;
    rememberedFolder(applicationId).then(
      (folder) => {
        if (!ignore) setRemembered({ folder });
      },
      (error: unknown) => {
        console.warn('Dropsea could not read the folder it keeps for this application', {
          applicationId,
          error,
        });
        if (!ignore) setRemembered({ folder: null });
      },
    );
    return () => {
      ignore = true;
    };
  }, [applicationId]);
  if (!remembered) return null;
  const start = startFolder(chooser.request, remembered.folder, places, folderExists);
  if (!start) {
    console.warn('Dropsea has no folder to open its panel in', { request: chooser.request });
    return null;
  }
  return <Redirect href={hrefFor({ kind: 'folder', uri: start })} />;
}
