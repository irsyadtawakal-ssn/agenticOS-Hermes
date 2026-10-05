import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { simsAudio } from '../src/sims-office/SimsAudio.ts';
import { shell } from '../src/shell/store.ts';

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
  clear: () => {
    for (const k in storage) delete storage[k];
  },
};

describe('Settings Dashboard & Preferences', () => {
  const originalLocalStorage = (globalThis as any).localStorage;

  beforeEach(() => {
    (globalThis as any).localStorage = mockLocalStorage;
    mockLocalStorage.clear();
    shell.closeAll();
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  describe('SimsAudio volume & mute settings', () => {
    it('provides master volume control with clamping', () => {
      simsAudio.setVolume(0.65);
      expect(simsAudio.getVolume()).toBe(0.65);

      simsAudio.setVolume(1.5);
      expect(simsAudio.getVolume()).toBe(1.0);

      simsAudio.setVolume(-0.2);
      expect(simsAudio.getVolume()).toBe(0.0);
    });

    it('toggles audio mute state properly', () => {
      simsAudio.setMuted(false);
      expect(simsAudio.isMuted()).toBe(false);

      const next = simsAudio.toggleMute();
      expect(next).toBe(true);
      expect(simsAudio.isMuted()).toBe(true);

      simsAudio.setMuted(false);
      expect(simsAudio.isMuted()).toBe(false);
    });
  });

  describe('Shell settings state & modal toggles', () => {
    it('starts with settings closed and toggles open/close', () => {
      expect(shell.getState().settingsOpen).toBe(false);

      shell.toggleSettings();
      expect(shell.getState().settingsOpen).toBe(true);
      expect(shell.getState().approvalsOpen).toBe(false);
      expect(shell.getState().costsOpen).toBe(false);

      shell.toggleSettings();
      expect(shell.getState().settingsOpen).toBe(false);
    });

    it('closes settings modal when closeAll is invoked', () => {
      shell.toggleSettings();
      expect(shell.getState().settingsOpen).toBe(true);

      shell.closeAll();
      expect(shell.getState().settingsOpen).toBe(false);
    });

    it('manages viewMode persistence between sims and claude', () => {
      shell.setViewMode('claude');
      expect(shell.getState().viewMode).toBe('claude');
      expect(mockLocalStorage.getItem('aos.office.viewMode')).toBe('claude');

      shell.setViewMode('sims');
      expect(shell.getState().viewMode).toBe('sims');
      expect(mockLocalStorage.getItem('aos.office.viewMode')).toBe('sims');
    });

    it('prioritizes settings toggle over other open panels', () => {
      shell.toggleApprovals();
      expect(shell.getState().approvalsOpen).toBe(true);

      shell.toggleSettings();
      expect(shell.getState().settingsOpen).toBe(true);
      expect(shell.getState().approvalsOpen).toBe(false);
    });
  });

  describe('Pengaturan Umum (General Settings) persistence', () => {
    it('stores and retrieves office identity settings', () => {
      mockLocalStorage.setItem('aos.settings.officeName', 'HQ Nusantara');
      mockLocalStorage.setItem('aos.settings.operatorName', 'Irsyad');
      mockLocalStorage.setItem('aos.settings.operatorRole', 'Lead Architect');

      expect(mockLocalStorage.getItem('aos.settings.officeName')).toBe('HQ Nusantara');
      expect(mockLocalStorage.getItem('aos.settings.operatorName')).toBe('Irsyad');
      expect(mockLocalStorage.getItem('aos.settings.operatorRole')).toBe('Lead Architect');
    });

    it('stores and retrieves language, timezone and chat input behavior', () => {
      mockLocalStorage.setItem('aos.settings.language', 'id');
      mockLocalStorage.setItem('aos.settings.timezone', 'Asia/Jakarta');
      mockLocalStorage.setItem('aos.settings.chatSendKey', 'ctrl');
      mockLocalStorage.setItem('aos.settings.speechLang', 'id-ID');

      expect(mockLocalStorage.getItem('aos.settings.language')).toBe('id');
      expect(mockLocalStorage.getItem('aos.settings.timezone')).toBe('Asia/Jakarta');
      expect(mockLocalStorage.getItem('aos.settings.chatSendKey')).toBe('ctrl');
      expect(mockLocalStorage.getItem('aos.settings.speechLang')).toBe('id-ID');
    });
  });
});
