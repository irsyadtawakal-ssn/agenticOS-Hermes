import * as apiClient from '../shared/api-client/index.ts';
import type {
  IApproval,
  IKanbanTask,
  IDailyCost,
  ICostTotals,
  ICostSummary,
  IHealthComponent,
  IAgentState,
  IProfileSpec,
  ICreateProfileInput,
} from '../shared/api-client/index.ts';

// Legacy Type Aliases for existing callers
export type Approval = IApproval;
export type KanbanTask = IKanbanTask;
export type DailyCost = IDailyCost;
export type CostTotals = ICostTotals;
export type CostSummary = ICostSummary;
export type HealthComponent = IHealthComponent;
export type AgentState = IAgentState;
export type ProfileSpec = IProfileSpec;
export type CreateProfileInput = ICreateProfileInput;

// Re-export all functions & types
export * from '../shared/api-client/index.ts';
export const getApprovals = apiClient.getApprovals;
export const decide = apiClient.decide;
export const getKanban = apiClient.getKanban;
export const moveCard = apiClient.moveCard;
export const createCard = apiClient.createCard;
export const getDailyCosts = apiClient.getDailyCosts;
export const getCosts = apiClient.getCosts;
export const getHealth = apiClient.getHealth;
export const getEvents = apiClient.getEvents;
export const getAgents = apiClient.getAgents;
export const triggerBackup = apiClient.triggerBackup;
export const getProfiles = apiClient.getProfiles;
export const createProfile = apiClient.createProfile;
