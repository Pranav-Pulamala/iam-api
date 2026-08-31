# Multi-Tenant IAM API

A backend API for managing users, organizations, roles, permissions, and authenticated sessions.

Built with TypeScript, Express, PostgreSQL, and Prisma, the project demonstrates how authentication
and tenant-aware authorization can work together in a multi-organization system.

## What you can do

The API supports the following workflows:

- Register and authenticate users
- Refresh authentication credentials
- Log out and revoke sessions
- Create organizations
- Add and remove organization members
- Create organization-specific roles
- Assign permissions to roles
- Assign roles to organization members
- Enforce permissions on protected operations
- List and revoke a user’s active sessions

## Authentication

Users can register, log in, retrieve their authenticated profile, refresh their credentials, and log
out.

Passwords are hashed with Argon2id before being stored. An unknown email and an incorrect password
return the same public error response.

When an email is not found, the login process still performs a dummy password-hash verification.
This helps reduce the timing difference between an unknown email and an incorrect password.

Access tokens are signed JWTs containing:

- `sub`: the authenticated user ID
- `sid`: the persistent session ID
- issuer and audience claims
- issued-at and expiration times

Protected endpoints expect the access token in this header:

```http
Authorization: Bearer ACCESS_TOKEN
```

## Persistent sessions

Registration and login create persistent session records in PostgreSQL.

Each session records:

- the user who owns it;
- its current refresh-token hash;
- its previous refresh-token hash;
- when it was created;
- when it expires;
- whether it has been revoked;
- when it was last used;
- user-agent metadata; and
- IP-address metadata.

Users can:

- list their sessions;
- identify their current session;
- revoke a specific session;
- revoke every other session; and
- revoke the current session by logging out.

The API does more than verify the JWT signature. It also confirms that the session referenced by the
token:

- exists;
- belongs to the token’s user;
- has not expired; and
- has not been revoked.

This allows logout and session revocation to invalidate an access token before the token naturally
expires.

## Refresh-token rotation

Refresh tokens are opaque credentials generated from cryptographically secure random bytes.

The raw refresh token is returned to the client, but it is not stored in PostgreSQL. The database
stores only its SHA-256 hash.

After a successful refresh:

1. The submitted refresh token is hashed and validated.
2. A replacement refresh token is generated.
3. The replacement hash becomes the session’s current hash.
4. The former hash becomes the previous hash.
5. A new access token is issued for the same session.

If a previous refresh token is submitted again, the API treats it as possible token replay and
revokes the user’s active sessions.

Responses containing tokens include headers that prevent HTTP caching:

```http
Cache-Control: no-store
Pragma: no-cache
```

## Organizations and memberships

Users and organizations have a many-to-many relationship through memberships.

A user does not contain an `organizationId`. This allows the same account to belong to multiple
organizations while having different access in each one.

When a user creates an organization, the API creates an `OWNER` membership for that user. Additional
users are added as `MEMBER`.

Organization functionality includes:

- creating an organization;
- listing organizations available to the current user;
- retrieving an organization through membership-scoped access;
- listing organization members;
- adding members; and
- removing members.

## Roles and permissions

Organizations can define custom roles and assign permissions to them.

The role-based access control model contains:

| Model                      | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `Role`                     | A custom role belonging to one organization  |
| `Permission`               | A globally available permission definition   |
| `RolePermission`           | Connects a permission to a role              |
| `MembershipRoleAssignment` | Assigns an organization role to a membership |

Built-in organization ownership remains separate from custom roles. This keeps the ownership rule
explicit while allowing organizations to create additional roles.

## Tenant-aware authorization

Protected organization operations evaluate access inside the requested organization.

Authorization checks can verify:

- that the authenticated user belongs to the organization;
- that the user is an organization owner;
- that the user has an assigned custom role;
- that the assigned role contains the required permission; and
- that referenced roles and memberships belong to the same organization.

The Prisma schema also uses organization-scoped unique keys and composite relationships. These
database constraints help prevent a role from one organization from being assigned to a membership
in another organization.

## API routes

All routes use the `/api/v1` prefix.

### Health

```text
GET /api/v1/health
```

### Authentication

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Session management

```text
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/others
DELETE /api/v1/auth/sessions/:sessionId
```

### Organizations and memberships

```text
POST   /api/v1/organizations
GET    /api/v1/organizations
GET    /api/v1/organizations/:organizationId
GET    /api/v1/organizations/:organizationId/members
POST   /api/v1/organizations/:organizationId/members
DELETE /api/v1/organizations/:organizationId/members/:userId
```

### Roles

```text
POST   /api/v1/organizations/:organizationId/roles
GET    /api/v1/organizations/:organizationId/roles
GET    /api/v1/organizations/:organizationId/roles/:roleId
PATCH  /api/v1/organizations/:organizationId/roles/:roleId
DELETE /api/v1/organizations/:organizationId/roles/:roleId
```

### Permissions

```text
GET /api/v1/permissions

POST   /api/v1/organizations/:organizationId/roles/:roleId/permissions
DELETE /api/v1/organizations/:organizationId/roles/:roleId/permissions/:permissionKey
```

### Membership role assignments

```text
POST   /api/v1/organizations/:organizationId/members/:userId/roles
GET    /api/v1/organizations/:organizationId/members/:userId/roles
DELETE /api/v1/organizations/:organizationId/members/:userId/roles/:roleId
```

## Permission definitions

The Prisma seed installs these permission definitions:

| Permission            | Purpose                               |
| --------------------- | ------------------------------------- |
| `organization:read`   | View organization information         |
| `organization:update` | Update organization information       |
| `member:read`         | View organization members             |
| `member:add`          | Add organization members              |
| `member:remove`       | Remove organization members           |
| `role:read`           | View organization roles               |
| `role:create`         | Create organization roles             |
| `role:update`         | Update organization roles             |
| `role:delete`         | Delete organization roles             |
| `role:assign`         | Assign roles to organization members  |
| `permission:read`     | View available permission definitions |

The seed uses Prisma upserts, so it can run repeatedly without creating duplicate permission
definitions.

## Requirements

You need:

- Node.js 22 or newer
- npm
- Docker Desktop
- Docker Compose

PostgreSQL runs through Docker Compose. The Node.js API runs directly on the host during local
development.

## Setup

### 1. Install dependencies

Install the dependency versions recorded in `package-lock.json`:

```bash
npm ci
```

### 2. Create the environment file

Copy the example environment file:

```bash
cp .env.example .env
```

Generate a private JWT secret:

```bash
openssl rand -base64 48
```

Replace the example `JWT_SECRET` value in `.env` with the generated value.

The `.env` file contains local credentials and must not be committed.

### 3. Start PostgreSQL

Make sure Docker Desktop is running, then execute:

```bash
docker compose up -d postgres
```

Check the container status:

```bash
docker compose ps
```

### 4. Generate the Prisma Client

```bash
npm run prisma:generate
```

### 5. Apply database migrations

```bash
npm run prisma:migrate:dev
```

### 6. Seed permission definitions

```bash
npm run prisma:seed
```

### 7. Start the API

```bash
npm run dev
```

The API uses this address by default:

```text
http://localhost:3000
```

Check that it is running:

```bash
curl http://localhost:3000/api/v1/health
```

## Environment variables

The application validates its environment during startup.

| Variable                        | Purpose                            | Example                   |
| ------------------------------- | ---------------------------------- | ------------------------- |
| `NODE_ENV`                      | Runtime environment                | `development`             |
| `PORT`                          | HTTP server port                   | `3000`                    |
| `SERVICE_NAME`                  | Service name used by the API       | `iam-api`                 |
| `LOG_LEVEL`                     | Pino logging level                 | `info`                    |
| `DATABASE_URL`                  | PostgreSQL connection URL          | Local Docker database URL |
| `JWT_SECRET`                    | Secret used to sign access tokens  | Locally generated secret  |
| `JWT_ACCESS_EXPIRES_IN`         | Access-token lifetime              | `15m`                     |
| `JWT_ISSUER`                    | Expected JWT issuer                | `iam-api`                 |
| `JWT_AUDIENCE`                  | Expected JWT audience              | `iam-api-client`          |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Session and refresh-token lifetime | `30`                      |

Use `.env.example` as the configuration template. Do not put real secrets in `.env.example`.

## Test database

Integration tests use a separate PostgreSQL database named `iam_api_test`.

Create it once inside the running PostgreSQL container:

```bash
docker exec iam-api-postgres createdb -U iam_api iam_api_test
```

If PostgreSQL reports that the database already exists, it does not need to be created again.

Apply all committed migrations to the test database:

```bash
DATABASE_URL='postgresql://iam_api:iam_api_dev_password@localhost:5432/iam_api_test?schema=public' npm run prisma:migrate:deploy
```

The integration test environment is configured in `tests/setup-env.ts`.

The test database must remain separate from development data because the integration tests create
and remove database records.

## Development commands

Start the development server:

```bash
npm run dev
```

Run the complete test suite once:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Check TypeScript without producing build files:

```bash
npm run typecheck
```

Run ESLint:

```bash
npm run lint
```

Format the project:

```bash
npm run format
```

Create the production build:

```bash
npm run build
```

## Database commands

Validate the Prisma schema:

```bash
npm run prisma:validate
```

Generate the Prisma Client:

```bash
npm run prisma:generate
```

Format the Prisma schema:

```bash
npm run prisma:format
```

Create and apply a development migration:

```bash
npm run prisma:migrate:dev -- --name migration_name
```

Apply existing migrations without creating a new migration:

```bash
npm run prisma:migrate:deploy
```

Seed the permission definitions:

```bash
npm run prisma:seed
```

Inspect local database records:

```bash
npm run prisma:studio
```

## Project structure

```text
prisma/
  migrations/
  schema.prisma
  seed.ts

src/
  config/
    env.ts
  errors/
    app-error.ts
  lib/
    logger.ts
    prisma.ts
    refresh-token.ts
  middleware/
    authenticate.ts
    error-handler.ts
    not-found-handler.ts
    require-permission.ts
  modules/
    auth/
    authorization/
    organizations/
    rbac/
    sessions/
  routes/
    health.route.ts
    index.ts
  types/
    express.d.ts
  app.ts
  server.ts

tests/
  integration/
    rbac/
    auth-security.test.ts
    auth.test.ts
    authorization.test.ts
    health.test.ts
    logout.test.ts
    organization.test.ts
    session-revocation.test.ts
    sessions.test.ts
  unit/
    refresh-token.test.ts
  setup-env.ts
```

## How it is built

Requests follow this layered flow:

```text
HTTP request
    |
    v
Express route
    |
    v
Authentication and authorization middleware
    |
    v
Controller and Zod validation
    |
    v
Service-layer business logic
    |
    v
Prisma
    |
    v
PostgreSQL
```

### Routes

Routes define HTTP methods, paths, and middleware composition.

### Controllers

Controllers validate untrusted request parameters and bodies with Zod. They invoke the service layer
and construct HTTP responses.

### Services

Services contain the authentication, session, organization, authorization, and RBAC business rules.

### Prisma

Prisma provides generated database types, relationships, migrations, transactions, unique
constraints, and indexes.

### Centralized middleware

Centralized middleware handles:

- security headers;
- request IDs;
- structured request logging;
- authentication;
- permission enforcement;
- unknown routes; and
- application errors.

## Security behavior

### Passwords

Passwords are hashed with Argon2id. Password hashes are excluded from safe user types and response
serializers.

### Access tokens

JWT access tokens are checked for:

- the expected signing algorithm;
- issuer;
- audience;
- expiration;
- user ID; and
- session ID.

The referenced database session must also be active and belong to the token’s user.

### Refresh tokens

Refresh tokens are:

- generated with cryptographically secure random bytes;
- stored only as SHA-256 hashes;
- rotated after successful use; and
- checked for previous-token replay.

### Tenant isolation

Organization access is checked through memberships, roles, and permissions. Composite database
relationships reinforce organization boundaries.

### Request validation

Zod validates untrusted request bodies and route parameters before they reach service-layer business
logic.

### Sensitive data

The application does not return password hashes in API responses.

Application logs do not include:

- passwords;
- password hashes;
- authorization headers;
- raw refresh tokens; or
- complete JWT access tokens.

## Validation

Before committing changes, run:

```bash
npm run prisma:validate
npm run prisma:generate
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

This sequence checks the Prisma schema, generated database types, formatting, lint rules, strict
TypeScript types, automated behavior, and the production build.

## Milestone history

This project was developed through separately committed milestones:

1. API and database foundation
2. User authentication
3. Organizations and memberships
4. Role-based access control
5. Permission-based authorization
6. Persistent sessions and refresh-token security

## License

This project is available under the [MIT License](LICENSE).
