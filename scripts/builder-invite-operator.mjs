import {
  issueBuilderInvite,
  readBuilderIdentityStore,
  revokeBuilderInvite,
  revokeBuilderSession,
  revokeBuilderSubject,
} from "../builder-runtime/lib/identity-store.ts";
import { reconcileBuilderUsage } from "../builder-runtime/lib/usage-ledger.ts";

function usage() {
  console.error(`Usage:
  node --experimental-strip-types scripts/builder-invite-operator.mjs issue --store <dir> --label <label> [--ttl-seconds 86400] [--subject <subjectId>] [--json]
  node --experimental-strip-types scripts/builder-invite-operator.mjs revoke-invite --store <dir> --id <inviteId> [--json]
  node --experimental-strip-types scripts/builder-invite-operator.mjs revoke-session --store <dir> --id <sessionId> [--json]
  node --experimental-strip-types scripts/builder-invite-operator.mjs revoke-subject --store <dir> --subject <subjectId> [--json]
  node --experimental-strip-types scripts/builder-invite-operator.mjs reconcile-usage --store <dir> --id <usageId> --outcome succeeded|failed [--cost-micros N] --reason <text> [--json]
  node --experimental-strip-types scripts/builder-invite-operator.mjs list --store <dir> [--json]`);
  process.exitCode = 2;
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (key === "json") {
      options.json = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

const { command, options } = parse(process.argv.slice(2));
const store = options.store || process.env.BUILDER_RUNTIME_STORE_DIR;
if (!store) {
  console.error("--store or BUILDER_RUNTIME_STORE_DIR is required.");
  process.exitCode = 2;
} else if (command === "issue") {
  const issued = await issueBuilderInvite({
    storeDir: store,
    label: options.label || `Synthetic identity ${new Date().toISOString()}`,
    inviteTtlSeconds: Number.parseInt(options["ttl-seconds"] || "86400", 10),
    subjectId: options.subject,
  });
  const output = {
    inviteId: issued.invite.id,
    subjectId: issued.subject.id,
    subjectLabel: issued.subject.label,
    token: issued.token,
    expiresAt: issued.invite.expiresAt,
  };
  if (options.json) console.log(JSON.stringify(output));
  else {
    console.log(`Invitation: ${output.inviteId}`);
    console.log(`Subject:    ${output.subjectId} (${output.subjectLabel})`);
    console.log(`Expires:    ${output.expiresAt}`);
    console.log(`Token:      ${output.token}`);
  }
} else if (command === "revoke-invite") {
  const revoked = await revokeBuilderInvite({ storeDir: store, inviteId: options.id });
  if (options.json) console.log(JSON.stringify({ revoked }));
  else console.log(revoked ? "Invitation revoked." : "Invitation not found or already revoked.");
  if (!revoked) process.exitCode = 1;
} else if (command === "revoke-session") {
  const revoked = await revokeBuilderSession({ storeDir: store, sessionId: options.id });
  if (options.json) console.log(JSON.stringify({ revoked }));
  else console.log(revoked ? "Session revoked." : "Session not found or already revoked.");
  if (!revoked) process.exitCode = 1;
} else if (command === "revoke-subject") {
  const revoked = await revokeBuilderSubject({ storeDir: store, subjectId: options.subject });
  if (options.json) console.log(JSON.stringify({ revoked }));
  else console.log(revoked ? "Subject and its sessions revoked." : "Subject not found.");
  if (!revoked) process.exitCode = 1;
} else if (command === "reconcile-usage") {
  const outcome = options.outcome;
  if (outcome !== "succeeded" && outcome !== "failed") {
    throw new Error("--outcome must be succeeded or failed.");
  }
  const reason = options.reason?.trim();
  if (!reason) throw new Error("--reason is required.");
  const costMicros = options["cost-micros"]
    ? Number.parseInt(options["cost-micros"], 10)
    : undefined;
  if (costMicros !== undefined && (!Number.isFinite(costMicros) || costMicros < 0)) {
    throw new Error("--cost-micros must be a non-negative integer.");
  }
  const reconciled = await reconcileBuilderUsage({
    storeDir: store,
    usageId: options.id,
    outcome,
    costMicros,
    reason,
  });
  if (options.json) console.log(JSON.stringify(reconciled));
  else {
    console.log(
      reconciled.changed
        ? `Usage ${reconciled.record.id} reconciled to ${reconciled.record.state} at ${reconciled.record.costMicros} micros.`
        : `Usage ${reconciled.record.id} was already ${reconciled.record.state}; no change.`,
    );
  }
  if (!reconciled.changed) process.exitCode = 1;
} else if (command === "list") {
  const state = await readBuilderIdentityStore(store);
  const output = {
    subjects: state.subjects.map((item) => ({
      id: item.id,
      label: item.label,
      createdAt: item.createdAt,
      revokedAt: item.revokedAt ?? null,
    })),
    invites: state.invites.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      label: item.label,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      usedAt: item.usedAt ?? null,
      revokedAt: item.revokedAt ?? null,
    })),
    sessions: state.sessions.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      revokedAt: item.revokedAt ?? null,
    })),
    usage: state.usage,
  };
  console.log(JSON.stringify(output, null, options.json ? 0 : 2));
} else {
  usage();
}
