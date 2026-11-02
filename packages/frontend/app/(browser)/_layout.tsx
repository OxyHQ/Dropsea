import { BrowserProvider } from '@/components/BrowserProvider';
import { BrowserShell } from '@/components/BrowserShell';

/** Every place Dropsea shows, in one window: the sidebar, and the place's pane. */
export default function BrowserLayout() {
  return (
    <BrowserProvider>
      <BrowserShell />
    </BrowserProvider>
  );
}
