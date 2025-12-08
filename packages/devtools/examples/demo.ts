import { createScope, atom, flow } from "@pumped-fn/lite";
import { createDevtools, consoleTransport, memory } from "../src";

const configAtom = atom({
  factory: async function configAtom() {
    await new Promise((r) => setTimeout(r, 5));
    return { dbUrl: "postgres://localhost" };
  },
});

const dbAtom = atom({
  deps: { config: configAtom },
  factory: async function dbAtom(_ctx, { config }) {
    await new Promise((r) => setTimeout(r, 10));
    return { query: (sql: string) => `result for ${sql} using ${config.dbUrl}` };
  },
});

const fetchUserFlow = flow({
  name: "fetchUser",
  deps: { db: dbAtom },
  factory: async (ctx, { db }) => {
    await new Promise((r) => setTimeout(r, 20));
    return db.query(`SELECT * FROM users WHERE id = ${ctx.input}`);
  },
});

async function main() {
  console.log("\n--- @pumped-fn/devtools demo ---\n");

  const scope = createScope({
    extensions: [createDevtools({ transports: [consoleTransport()] })],
  });

  await scope.resolve(dbAtom);

  const ctx = scope.createContext();
  await ctx.exec({ flow: fetchUserFlow, input: "user-123" });
  await ctx.close();

  await scope.dispose();

  console.log("\n--- done ---\n");
}

main();
