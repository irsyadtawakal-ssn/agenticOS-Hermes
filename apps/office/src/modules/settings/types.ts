export type HermesMenuKey =
  | 'model_main'
  | 'model_fallback'
  | 'model_auxiliary'
  | 'model_moa'
  | 'chat'
  | 'appearance'
  | 'workspace'
  | 'agents'
  | 'safety'
  | 'browser'
  | 'passwords'
  | 'memory'
  | 'voice'
  | 'advanced'
  | 'notifications'
  | 'billing'
  | 'providers'
  | 'gateways'
  | 'shortcuts'
  | 'tools'
  | 'sessions'
  | 'about';

export interface ISettingsSectionProps {
  selectedKey: HermesMenuKey;
  onSaveItem: (key: string, value: string) => void;
  showToast: (msg: string) => void;
}
