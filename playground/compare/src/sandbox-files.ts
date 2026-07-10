import contract from "../cases/account-onboarding/contract.ts?raw"
import fixture from "../cases/account-onboarding/fixture.ts?raw"
import awilix from "../cases/account-onboarding/lanes/awilix.ts?raw"
import effect from "../cases/account-onboarding/lanes/effect.ts?raw"
import inversify from "../cases/account-onboarding/lanes/inversify.ts?raw"
import plain from "../cases/account-onboarding/lanes/plain.ts?raw"
import pumped from "../cases/account-onboarding/lanes/pumped.ts?raw"
import scenario from "../cases/account-onboarding/scenario.ts?raw"
import index from "../sandbox/index.html?raw"
import main from "../sandbox/main.ts?raw"
import styles from "../sandbox/styles.css?raw"
import tsconfig from "../sandbox/tsconfig.json?raw"

export const sandboxFiles = {
  "/index.html": index,
  "/tsconfig.json": tsconfig,
  "/cases/account-onboarding/contract.ts": contract,
  "/cases/account-onboarding/fixture.ts": fixture,
  "/cases/account-onboarding/lanes/awilix.ts": awilix,
  "/cases/account-onboarding/lanes/effect.ts": effect,
  "/cases/account-onboarding/lanes/inversify.ts": inversify,
  "/cases/account-onboarding/lanes/plain.ts": plain,
  "/cases/account-onboarding/lanes/pumped.ts": pumped,
  "/cases/account-onboarding/scenario.ts": scenario,
  "/sandbox/main.ts": main,
  "/sandbox/styles.css": styles,
}

export const sandboxDependencies = {
  "@pumped-fn/lite": "4.0.0",
  awilix: "13.0.5",
  effect: "3.21.3",
  inversify: "8.1.2",
  "reflect-metadata": "0.2.2",
}
