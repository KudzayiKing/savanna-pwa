#!/usr/bin/env node
/**
 * Admin role management — grant, revoke and inspect Firebase custom claims.
 *
 * This is deliberately a server-side CLI and not a screen in the PWA.
 * Custom claims can only be minted by the Firebase Admin SDK, which requires
 * service-account credentials. Putting that power in the browser would mean
 * shipping those credentials to every visitor, so promotion and demotion has
 * to happen here, by an operator, on a machine that already holds them.
 *
 * Usage:
 *   node scripts/admin-roles.mjs list
 *   node scripts/admin-roles.mjs show <email|uid>
 *   node scripts/admin-roles.mjs grant <email|uid> <role> [--operator you@domain]
 *   node scripts/admin-roles.mjs revoke <email|uid> [--operator you@domain] [--force]
 *
 * Roles:
 *   super_admin      everything
 *   support_admin    user.moderate, report.triage
 *   moderator        report.triage, community.review
 *   merchant_admin   shop.review
 *   community_admin  community.review
 *   analyst          read-only
 *
 * Credentials (in order of preference):
 *   FIREBASE_SERVICE_ACCOUNT       raw service-account JSON
 *   GOOGLE_APPLICATION_CREDENTIALS path to a service-account JSON file
 *   --emulator                     talk to a running emulator, no creds needed
 *
 * Project: --project, or FIREBASE_PROJECT_ID / GCLOUD_PROJECT / .env
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const VALID_ROLES = [
  "super_admin",
  "support_admin",
  "moderator",
  "merchant_admin",
  "community_admin",
  "analyst",
];

const REASON_MIN_LENGTH = 8;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const [name, inline] = token.slice(2).split("=");
      flags[name] = inline ?? argv[index + 1] ?? true;
      if (inline === undefined && argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Reads VITE_FIREBASE_PROJECT_ID out of .env without adding a dotenv dep. */
async function projectIdFromEnvFile() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env"), "utf8");
    const match = /^\s*VITE_FIREBASE_PROJECT_ID\s*=\s*(.+)\s*$/m.exec(text);
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

async function resolveCredential(flags) {
  if (flags.emulator) return null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  }
  // Last resort: application default credentials from `gcloud auth application-default login`.
  return undefined;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, identifier, roleArg] = positional;

  if (!command || command === "help" || flags.help) {
    console.log(`
  Admin roles

    node scripts/admin-roles.mjs list
    node scripts/admin-roles.mjs show <email|uid>
    node scripts/admin-roles.mjs grant <email|uid> <role> --reason "why" --operator you@domain
    node scripts/admin-roles.mjs revoke <email|uid> --reason "why" --operator you@domain

  Roles: ${VALID_ROLES.join(", ")}
`);
    return;
  }

  const { cert, getApps, initializeApp: initAdmin, auth, firestore } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

  const emulator = Boolean(flags.emulator);
  const projectId = flags.project
    || process.env.FIREBASE_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || (await projectIdFromEnvFile());

  if (!emulator && !projectId) {
    die("No project id. Pass --project or set VITE_FIREBASE_PROJECT_ID in .env.");
  }

  if (emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8099";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  }

  const credential = await resolveCredential(flags);
  if (!emulator && !credential && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    die("No credentials. Set FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or log in with gcloud.");
  }

  if (!getApps().length) {
    initAdmin(credential
      ? { credential: cert(credential), projectId }
      : { projectId });
  }

  const adminAuth = getAuth();
  const db = getFirestore();

  const findUser = async () => {
    if (identifier.includes("@")) {
      return adminAuth.getUserByEmail(identifier);
    }
    return adminAuth.getUser(identifier);
  };

  const operator = flags.operator || process.env.ADMIN_OPERATOR_EMAIL || "unknown-operator";

  /**
   * Writes the audit entry for the change itself.
   *
   * The Admin SDK bypasses security rules, so this is not validated by
   * firestore.rules — meaning it is on this script to produce the same shape
   * the browser writes. Keeping the two identical is what lets one audit view
   * show operator promotions and in-app moderation side by side.
   */
  const writeAudit = async (user, action, before, after, reason) => {
    await db.collection("adminAuditLogs").add({
      adminUserId: user.uid,
      adminName: user.displayName ?? user.email ?? null,
      adminRole: after.adminRole ?? null,
      action,
      targetType: "user",
      targetId: user.uid,
      reason,
      before,
      after,
      detail: null,
      actorUserAgent: "savanna-admin-roles-cli",
      actorPlatform: "server",
      actorLanguage: null,
      actorTimezone: null,
      actorScreen: null,
      ipAddress: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  };

  if (command === "list") {
    const users = await adminAuth.listUsers(1000);
    const admins = users.users.filter(user => user.customClaims?.adminRole || user.customClaims?.admin);
    if (!admins.length) {
      console.log("\n  No accounts hold an admin role.\n");
      return;
    }
    console.log("\n  Admin accounts:\n");
    for (const user of admins) {
      const role = user.customClaims?.adminRole ?? (user.customClaims?.admin ? "super_admin (legacy)" : null);
      console.log(`    ${role.padEnd(18)} ${user.email ?? "(no email)"}  ${user.uid}`);
    }
    console.log("");
    return;
  }

  if (command === "show") {
    if (!identifier) die("show needs an email or uid.");
    const user = await findUser();
    console.log(`\n  ${user.email ?? "(no email)"}  ${user.uid}`);
    console.log(`  adminRole: ${user.customClaims?.adminRole ?? "(none)"}`);
    console.log(`  all claims: ${JSON.stringify(user.customClaims ?? {})}\n`);
    return;
  }

  if (command === "grant" || command === "revoke") {
    if (!identifier) die(`${command} needs an email or uid.`);

    const reason = String(flags.reason ?? "").trim();
    if (reason.length < REASON_MIN_LENGTH) {
      die(`--reason is required and must be at least ${REASON_MIN_LENGTH} characters. It is written to the permanent audit log.`);
    }

    const user = await findUser();
    const existing = user.customClaims ?? {};
    const previousRole = existing.adminRole ?? null;

    let nextClaims;
    let action;

    if (command === "grant") {
      if (!roleArg) die("grant needs a role.");
      if (!VALID_ROLES.includes(roleArg)) die(`Unknown role "${roleArg}". Valid: ${VALID_ROLES.join(", ")}`);
      if (previousRole === roleArg) die(`${user.email ?? user.uid} already has role ${roleArg}.`);
      // Merge rather than replace. setCustomUserClaims overwrites the whole
      // claim object, so any unrelated claim on the account — a legacy
      // `admin: true`, or anything added later — would be silently dropped.
      nextClaims = { ...existing, adminRole: roleArg };
      action = "admin.role.grant";
    } else {
      if (!previousRole && !existing.admin) die(`${user.email ?? user.uid} holds no admin role.`);
      if (!flags.force) {
        // Guard against accidentally emptying the admin bench. Without at
        // least one super_admin there is no way back in through the console —
        // only another run of this script.
        const users = await adminAuth.listUsers(1000);
        const superAdmins = users.users.filter(item =>
          item.customClaims?.adminRole === "super_admin" || item.customClaims?.admin === true);
        const removingLast = previousRole === "super_admin" && superAdmins.length <= 1;
        if (removingLast) {
          die("This is the last super_admin. Refusing to leave the console with no owner — pass --force if you really mean it.");
        }
      }
      const { adminRole: _drop, admin: _dropLegacy, ...rest } = existing;
      nextClaims = rest;
      action = "admin.role.revoke";
    }

    await adminAuth.setCustomUserClaims(user.uid, nextClaims);

    // Mirror onto the profile document. The app trusts the claim, but the
    // admin user list reads the document, and an un-mirrored revocation would
    // keep showing a stale role badge until the next sign-in overwrote it.
    try {
      await db.collection("users").doc(user.uid).set(
        { adminRole: nextClaims.adminRole ?? null, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch {
      // The profile may not exist yet. That is fine — the claim is what
      // governs access, and ensureUserProfile() seeds the field on first sign-in.
    }

    await writeAudit(
      user,
      action,
      { adminRole: previousRole },
      { adminRole: nextClaims.adminRole ?? null },
      `${reason} (by ${operator})`,
    );

    const label = user.email ?? user.uid;
    if (command === "grant") {
      console.log(`\n  Granted ${nextClaims.adminRole} to ${label}.`);
    } else {
      console.log(`\n  Revoked admin access from ${label}.`);
    }
    console.log(`  Reason recorded: ${reason}`);
    console.log(`  Operator: ${operator}`);
    console.log("\n  Their access updates when their ID token refreshes (up to 1 hour),");
    console.log("  or immediately if they use \"Refresh access\" on the admin page.\n");
    return;
  }

  die(`Unknown command "${command}". Try: list, show, grant, revoke.`);
}

main().catch(error => {
  console.error(`\n  Failed: ${error?.message ?? error}\n`);
  process.exit(1);
});
