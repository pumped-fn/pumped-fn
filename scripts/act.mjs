#!/usr/bin/env node
import { createWriteStream } from "node:fs"
import { chmod, mkdir, rm, stat } from "node:fs/promises"
import { spawn } from "node:child_process"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { arch, platform } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const version = "v0.2.89"
const os = {
  darwin: "Darwin",
  linux: "Linux",
  win32: "Windows",
}[platform()]
const cpu = {
  arm64: "arm64",
  ia32: "i386",
  x64: "x86_64",
}[arch()]

if (!os || !cpu) {
  throw new Error(`Unsupported act platform: ${platform()} ${arch()}`)
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const format = os === "Windows" ? "zip" : "tar.gz"
const binaryName = os === "Windows" ? "act.exe" : "act"
const dir = join(root, ".tools", "act", version, `${os}_${cpu}`)
const binary = join(dir, binaryName)
const archive = join(dir, `act.${format}`)
const url = `https://github.com/nektos/act/releases/download/${version}/act_${os}_${cpu}.${format}`

const exists = await stat(binary).then(
  () => true,
  () => false,
)

if (!exists) {
  await mkdir(dir, { recursive: true })

  const response = await fetch(url)

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))

  if (format === "zip") {
    await run("tar", ["-xf", archive, "-C", dir])
  } else {
    await run("tar", ["-xzf", archive, "-C", dir, binaryName])
  }

  await chmod(binary, 0o755)
  await rm(archive)
}

const child = spawn(binary, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  }

  process.exit(code ?? 1)
})

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))
      }
    })
  })
}
