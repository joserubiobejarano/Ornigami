import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BUILDER_STORE_HOST_ID,
  inspectBuilderStore,
  issueBuilderInvite,
  readBuilderIdentityStore,
  recoverBuilderStoreLock,
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
  node --experimental-strip-types scripts/builder-invite-operator.mjs lock-status --store <dir> [--json]
  node --experimental-strip-types scripts/builder-invite-operator.mjs recover-lock --store <dir> --token <lockToken> [--reap-token <token>] --confirm-no-writers [--json]
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
    if (key === "confirm-no-writers") {
      options["confirm-no-writers"] = true;
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
} else if (command === "lock-status") {
  const inspected = await inspectBuilderStore(store);
  let storeHash = null;
  try {
    storeHash = createHash("sha256")
      .update(readFileSync(path.join(inspected.storeDir, "identity-store.json")))
      .digest("hex");
  } catch {
    // Missing or unreadable files are already reported by the inspection.
  }
  const output = { ...inspected, storeHash };
  if (options.json) console.log(JSON.stringify(output));
  else {
    console.log(`Store:       ${output.storeDir}`);
    console.log(`Host ID:     ${output.hostId}`);
    console.log(`Store file:  ${output.storePresent ? `version ${output.storeVersion ?? "unknown"}` : "missing"}${output.storeError ? ` (${output.storeError})` : ""}`);
    console.log(`Store SHA:   ${output.storeHash ?? "unavailable"}`);
    for (const lock of [output.lock, output.reapLock]) {
      if (!lock.present) {
        console.log(`${lock.name}: absent`);
      } else if (!lock.valid) {
        console.log(`${lock.name}: INVALID metadata (manual recovery required)`);
      } else {
        console.log(
          `${lock.name}: owner=${lock.owner} token=${lock.metadata.token} pid=${lock.metadata.pid} host=${lock.metadata.hostname} acquired=${lock.metadata.acquiredAt}`,
        );
      }
    }
    if (output.temporaryFiles.length > 0) {
      console.log(`Temporary:   ${output.temporaryFiles.join(", ")}`);
    }
  }
} else if (command === "recover-lock") {
  if (options["confirm-no-writers"] !== true) {
    throw new Error(
      "--confirm-no-writers is required after stopping the runtime and every operator process.",
    );
  }
  const token = options.token?.trim();
  if (!token) {
    throw new Error(
      "--token is required. Copy the observed token from lock-status; it prevents displacing a successor lock.",
    );
  }
  const recovered = await recoverBuilderStoreLock({
    storeDir: store,
    expectedToken: token,
    expectedReapToken: options["reap-token"],
    confirmNoWriters: true,
  });
  if (options.json) console.log(JSON.stringify(recovered));
  else {
    console.log(
      `Recovered:   ${recovered.recovered.length > 0 ? recovered.recovered.join(", ") : "none"}`,
    );
    for (const file of recovered.quarantined) {
      console.log(`Quarantine:  ${file}`);
    }
    console.log(`Store SHA:   ${recovered.storeHash}`);
    console.log(`Store intact:${recovered.storeUnchanged ? " yes" : " NO"}`);
  }
  if (!recovered.storeUnchanged) {
    console.error(
      "The store changed during recovery. Stop, preserve the quarantine files, and investigate before restarting.",
    );
    process.exitCode = 1;
  } else if (recovered.recovered.length === 0) {
    console.error("No lock files were recovered.");
    process.exitCode = 1;
  }
} else if (command === "list") {
  const state = await readBuilderIdentityStore(store);
  const output = {
    hostId: BUILDER_STORE_HOST_ID,
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
