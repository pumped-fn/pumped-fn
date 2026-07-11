import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs"
import { createWorker } from "@valtown/codemirror-ts/worker"
import * as Comlink from "comlink"
import ts from "typescript"
import payload from "virtual:editor-types"
import { sandboxFiles } from "../sandbox-files"

Comlink.expose(
  createWorker(async () => {
    const fsMap = new Map<string, string>()
    for (const [path, source] of Object.entries(payload.libs)) fsMap.set(path, source)
    for (const [path, source] of Object.entries(payload.files)) fsMap.set(path, source)
    const rootFiles: string[] = []
    for (const [path, source] of Object.entries(sandboxFiles)) {
      if (!path.endsWith(".ts")) continue
      fsMap.set(path, source)
      rootFiles.push(path)
    }
    return createVirtualTypeScriptEnvironment(createSystem(fsMap), rootFiles, ts, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
    })
  }),
)
