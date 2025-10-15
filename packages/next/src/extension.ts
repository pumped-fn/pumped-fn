import { type Extension } from "./types";

export function extension<T extends Extension.Extension>(ext: T): T {
  return ext;
}
