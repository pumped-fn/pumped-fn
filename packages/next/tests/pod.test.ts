import { vi, describe, it, expect, test } from "vitest";
import {
  createScope,
  podOnly,
  provide,
  derive,
  placeholder,
  preset,
  meta,
  custom,
} from "../src";

const debug = meta("debug", custom<string>());

describe("pod scope", () => {
  test("shared value will be copied", async () => {
    const mainScope = createScope();

    let seed = 0;
    let nonshared = 0;

    const sharedValue = provide(() => seed++);
    const derivedSharedValue = derive(
      [sharedValue],
      ([value]) => value + nonshared++
    );

    const pod1 = mainScope.pod();
    const pod2 = mainScope.pod();

    await pod1.resolve(sharedValue);
    await pod2.resolve(sharedValue);

    expect(seed).toBe(1);

    await pod1.resolve(derivedSharedValue);
    await pod2.resolve(derivedSharedValue);

    expect(nonshared).toBe(1);
  });
});

test("pod value will be isolated", async () => {
  let shared = 0;
  let nonshared = 0;

  const placeholderValue = placeholder<number>(podOnly, debug("placeholder"));
  const mainScope = createScope();
  const sharedValue = provide(() => ++shared, debug("sharedValue"));
  const next = derive(
    [sharedValue, placeholderValue],
    ([sharedValue, placeholderValue]) =>
      sharedValue + nonshared++ + placeholderValue,
    podOnly,
    debug("next ")
  );

  const pod1 = mainScope.pod(preset(placeholderValue, 1));
  const pod2 = mainScope.pod(preset(placeholderValue, 2));

  const v1 = await pod1.resolve(next);
  const v2 = await pod2.resolve(next);

  expect(shared).toBe(1);
  expect(nonshared).toBe(2);

  expect(v1).toBe(2);
  expect(v2).toBe(4);
});
