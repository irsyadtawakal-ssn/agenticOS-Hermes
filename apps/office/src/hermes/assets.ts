import type { ServerMessage } from '../../vendor/pixel-agents/core/src/messages.ts';
import type { MockPayload } from '../../vendor/pixel-agents/webview-ui/src/browserMock.ts';

export interface LoadedAssets {
  messages: ServerMessage[];
  defaultLayout: unknown;
}

/** Asset messages in the load order the office expects (layoutLoaded is sent separately). */
export function assetMessages(payload: MockPayload): LoadedAssets {
  const messages: ServerMessage[] = [
    { type: 'characterSpritesLoaded', characters: payload.characters },
    { type: 'floorTilesLoaded', sprites: payload.floorSprites },
    { type: 'wallTilesLoaded', sets: payload.wallSets },
    { type: 'carpetTilesLoaded', sets: payload.carpetSets },
    { type: 'furnitureAssetsLoaded', catalog: payload.furnitureCatalog, sprites: payload.furnitureSprites },
  ] as ServerMessage[];
  return { messages, defaultLayout: payload.layout };
}

export async function loadBrowserAssets(): Promise<LoadedAssets> {
  const mock = await import('../../vendor/pixel-agents/webview-ui/src/browserMock.ts');
  if (!mock.getMockPayload()) await mock.initBrowserMock();
  const payload = mock.getMockPayload();
  if (!payload) throw new Error('office assets failed to load');
  return assetMessages(payload);
}
