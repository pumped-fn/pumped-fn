import { type ReactNode } from "react";
import { ScopeProvider, useAtom } from "@pumped-fn/lite-react";
import type { Devtools } from "@pumped-fn/lite-devtools";
import { TextAttributes } from "@opentui/core";
import { scope, eventsAtom } from "./state";

// Bridge React 18/19 type boundary: lite-react uses React 18 types, this package uses React 19
function Provider({ children }: { children: ReactNode }) {
  return <ScopeProvider scope={scope} children={children as React.ReactNode} />;
}

const ICONS: Record<Devtools.EventType, string> = {
  "atom:resolve": "⚡", "atom:resolved": "✓", "flow:exec": "▶", "flow:complete": "✓", error: "✗",
};

function formatEvent(event: Devtools.Event): string {
  const time = new Date(event.timestamp).toISOString().slice(11, 23);
  const duration = event.duration ? ` (${event.duration.toFixed(1)}ms)` : "";
  return `[${time}] ${ICONS[event.type]} ${event.type.padEnd(14)} ${event.name}${duration}`;
}

function EventList() {
  const events = useAtom(eventsAtom);
  if (events.length === 0) return <text fg="gray">Waiting for events...</text>;
  return (
    <box flexDirection="column">
      {events.slice(-20).map((e) => (
        <text key={e.id} fg={e.type === "error" ? "red" : "white"}>{formatEvent(e)}</text>
      ))}
    </box>
  );
}

function StatusBar({ port }: { port: number }) {
  const events = useAtom(eventsAtom);
  return <text fg="cyan">Port: {port} | Events: {events.length}</text>;
}

function Content({ port }: { port: number }) {
  return (
    <box flexDirection="column" padding={1}>
      <text attributes={TextAttributes.BOLD} fg="green">Lite Devtools Server</text>
      <box marginTop={1} flexDirection="column" flexGrow={1}>
        <EventList />
      </box>
      <box marginTop={1}>
        <StatusBar port={port} />
      </box>
    </box>
  );
}

export function App({ port }: { port: number }) {
  return (
    <Provider>
      <Content port={port} />
    </Provider>
  );
}
