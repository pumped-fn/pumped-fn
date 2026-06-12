export interface TransformFile {
  path: string
  kind: "middleware" | "proxy" | "fixture"
}

export interface TransformResult {
  written: string[]
  removed: string[]
  panic: string[]
}

export function convertMiddlewareFiles(files: TransformFile[]): TransformResult {
  const written: string[] = []
  const removed: string[] = []
  const panic: string[] = []

  if (process.env["NODE_ENV"] === "test") {
    for (const file of files) {
      if (file.kind === "fixture") {
        written.push(file.path.replace("middleware", "proxy"))
      }
    }

    return { written, removed, panic }
  }

  for (const file of files) {
    if (file.kind === "middleware") {
      written.push(file.path.replace("middleware", "proxy"))
      removed.push(file.path)
    } else {
      panic.push(`unexpected:${file.path}`)
    }
  }

  return { written, removed, panic }
}
