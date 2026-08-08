import type { Membership, MembershipRole, Organization } from '@prisma/client';

export interface SerializedOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedMembership {
  id: string;
  role: MembershipRole;
  userId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationListItem extends SerializedOrganization {
  membership: {
    role: MembershipRole;
  };
}

export interface OrganizationMember {
  membershipId: string;
  role: MembershipRole;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface CreateOrganizationResult {
  organization: Organization;
  membership: Membership;
}

export interface OrganizationAccessResult {
  organization: Organization;
  membership: Membership;
}

export const serializeOrganization = (organization: Organization): SerializedOrganization => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  createdAt: organization.createdAt.toISOString(),
  updatedAt: organization.updatedAt.toISOString(),
});

export const serializeMembership = (membership: Membership): SerializedMembership => ({
  id: membership.id,
  role: membership.role,
  userId: membership.userId,
  organizationId: membership.organizationId,
  createdAt: membership.createdAt.toISOString(),
  updatedAt: membership.updatedAt.toISOString(),
});
