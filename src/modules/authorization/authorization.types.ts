import type { PermissionKey } from './permissions.js';

export type AuthorizationDecisionReason =
  | 'STRUCTURAL_OWNER'
  | 'ROLE_PERMISSION_MATCH'
  | 'NOT_A_MEMBER'
  | 'PERMISSION_NOT_GRANTED';

export interface AuthorizationInput {
  userId: string;
  organizationId: string;
  permission: PermissionKey;
}

interface AuthorizationDecisionBase extends AuthorizationInput {
  matchedRoleIds: readonly string[];
  reason: AuthorizationDecisionReason;
}

export interface AllowedAuthorizationDecision extends AuthorizationDecisionBase {
  allowed: true;
  membershipId: string;
  reason: 'STRUCTURAL_OWNER' | 'ROLE_PERMISSION_MATCH';
}

export interface DeniedNotMemberDecision extends AuthorizationDecisionBase {
  allowed: false;
  reason: 'NOT_A_MEMBER';
}

export interface DeniedPermissionDecision extends AuthorizationDecisionBase {
  allowed: false;
  membershipId: string;
  reason: 'PERMISSION_NOT_GRANTED';
}

export type AuthorizationDecision =
  | AllowedAuthorizationDecision
  | DeniedNotMemberDecision
  | DeniedPermissionDecision;
