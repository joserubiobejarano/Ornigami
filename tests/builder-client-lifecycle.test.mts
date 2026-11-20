import assert from "node:assert/strict";
import test from "node:test";

type FakeStorage = {
  data: Map<string, string>;
  get length(): number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

function fakeWindow() {
  const data = new Map<string, string>();
  const storage: FakeStorage = {
    data,
    get length() {
      return data.size;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
  const broadcasts: unknown[] = [];
  class FakeBroadcastChannel {
    readonly name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage(value: unknown) {
      broadcasts.push(value);
    }
    close() {}
  }
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: storage,
    BroadcastChannel: FakeBroadcastChannel,
  };
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel =
    FakeBroadcastChannel;
  return { data, broadcasts };
}

const { builderClientLifecycle } = await import(
  "../builder-runtime/lib/client-lifecycle.ts"
);

test("sign-out stops persistence before clearing and aborts pending work", () => {
  const { data, broadcasts } = fakeWindow();
  builderClientLifecycle.signOutUnconfirmed();
  data.set("ornigami.builder.offer-intake.brief.v1:sub_a", "sensitive");
  data.set("unrelated", "keep");
  const controller = new AbortController();
  builderClientLifecycle.registerPendingWork(controller);

  builderClientLifecycle.beginSignOut();
  assert.equal(builderClientLifecycle.canPersist(), false);
  assert.equal(controller.signal.aborted, true);
  assert.equal(data.has("ornigami.builder.offer-intake.brief.v1:sub_a"), false);
  assert.equal(data.has("unrelated"), true);
  assert.equal(broadcasts.length, 0);

  const late = new AbortController();
  builderClientLifecycle.registerPendingWork(late);
  assert.equal(late.signal.aborted, true, "work cannot start while sign-out is pending");

  builderClientLifecycle.signOutUnconfirmed();
  assert.equal(builderClientLifecycle.canPersist(), true);
});

test("confirmed sign-out and workspace end clear every builder draft and notify tabs", () => {
  const { data, broadcasts } = fakeWindow();
  builderClientLifecycle.signOutUnconfirmed();
  data.set("ornigami.builder.offer-intake.brief.v1:sub_a", "a");
  data.set("ornigami.builder.offer-intake.brief.v1:sub_b", "b");

  builderClientLifecycle.confirmSignOut();
  assert.equal(builderClientLifecycle.canPersist(), false);
  assert.equal(data.size, 0);
  assert.deepEqual(broadcasts, [{ type: "workspace-ended" }]);

  builderClientLifecycle.signOutUnconfirmed();
  data.set("ornigami.builder.offer-intake.brief.v1:sub_a", "a");
  builderClientLifecycle.endWorkspace("sub_a");
  assert.equal(data.size, 0);
  assert.equal(broadcasts.length, 2);

  data.set("ornigami.builder.offer-intake.brief.v1:sub_a", "a");
  builderClientLifecycle.endWorkspace("sub_a", { broadcast: false });
  assert.equal(data.size, 0);
  assert.equal(broadcasts.length, 2, "remote cleanup must not rebroadcast");
});
