import { createScope, atom, flow } from "@pumped-fn/lite";
import { createDevtools, httpTransport } from "@pumped-fn/lite-devtools";

const scope = createScope({
  extensions: [createDevtools({ transports: [httpTransport({ url: "http://localhost:3001/events" })] })],
});

const userAtom = atom(async () => {
  await new Promise((r) => setTimeout(r, 100));
  return { id: 1, name: "Alice" };
});

const greetFlow = flow<string, { name: string }>((ctx) => `Hello, ${ctx.input.name}!`);

async function main() {
  const user = await scope.resolve(userAtom);
  const ctx = scope.createContext();
  await ctx.exec({ flow: greetFlow, input: { name: user.name } });
  await ctx.close();
  console.log("Events sent!");
  await new Promise((r) => setTimeout(r, 1000));
  await scope.dispose();
}

main().catch(console.error);
