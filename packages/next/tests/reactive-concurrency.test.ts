import { describe, test, expect } from "vitest";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";

const name = tag(custom<string>(), { label: "name" });

describe("Reactive executor concurrency issues", () => {
  test("demonstrates lost update with concurrent function-based updates", async () => {
    const counter = provide(() => 0, name("counter"));
    const scope = createScope();

    await scope.resolve(counter);
    expect(scope.accessor(counter).get()).toBe(0);

    await Promise.all([
      scope.update(counter, (x) => x + 1),
      scope.update(counter, (x) => x + 1),
      scope.update(counter, (x) => x + 1),
    ]);

    const finalValue = scope.accessor(counter).get();

    expect(finalValue).toBe(3);
  }, 5000);

  test("demonstrates race condition with read-modify-write pattern", async () => {
    const account = provide(() => ({ balance: 100 }), name("account"));
    const scope = createScope();

    await scope.resolve(account);

    const withdraw = (amount: number) =>
      scope.update(account, (current) => ({
        balance: current.balance - amount,
      }));

    await Promise.all([withdraw(10), withdraw(20), withdraw(30)]);

    const finalBalance = scope.accessor(account).get().balance;

    expect(finalBalance).toBe(40);
  }, 5000);

  test("demonstrates interleaving with reactive propagation", async () => {
    const source = provide(() => 0, name("source"));
    const derived = derive(source.reactive, (x) => x * 2, name("derived"));

    const scope = createScope();
    await scope.resolve(source);
    await scope.resolve(derived);

    const updates: number[] = [];
    scope.onUpdate(derived, (accessor) => {
      updates.push(accessor.get());
    });

    await Promise.all([
      scope.update(source, 1),
      scope.update(source, 2),
      scope.update(source, 3),
    ]);

    const finalDerived = scope.accessor(derived).get();
    expect(finalDerived).toBe(6);
    expect(updates).toEqual([2, 4, 6]);
  }, 5000);

  test("demonstrates concurrent updates causing value overwrites", async () => {
    const counter = provide(() => 0, name("counter"));
    const scope = createScope();
    await scope.resolve(counter);

    const incrementOperations = Array.from({ length: 10 }, (_, i) =>
      scope.update(counter, (current) => {
        return current + 1;
      })
    );

    await Promise.all(incrementOperations);

    const finalValue = scope.accessor(counter).get();
    expect(finalValue).toBe(10);
  }, 5000);

  test("demonstrates concurrent updates on reactive chain", async () => {
    const base = provide(() => 0, name("base"));
    const step1 = derive(base.reactive, (x) => x + 1, name("step1"));
    const step2 = derive(step1.reactive, (x) => x + 1, name("step2"));

    const scope = createScope();
    await scope.resolve(base);
    await scope.resolve(step1);
    await scope.resolve(step2);

    await Promise.all([
      scope.update(base, (x) => x + 1),
      scope.update(base, (x) => x + 1),
      scope.update(base, (x) => x + 1),
    ]);

    const baseValue = scope.accessor(base).get();
    const step1Value = scope.accessor(step1).get();
    const step2Value = scope.accessor(step2).get();

    expect(baseValue).toBe(3);
    expect(step1Value).toBe(4);
    expect(step2Value).toBe(5);
  }, 5000);

  test("demonstrates lost update with interleaved reads (anti-pattern)", async () => {
    const counter = provide(() => 0, name("counterWithDelay"));
    const scope = createScope();
    await scope.resolve(counter);

    const readAndIncrement = () => {
      const current = scope.accessor(counter).get();
      return scope.update(counter, current + 1);
    };

    await Promise.all([
      readAndIncrement(),
      readAndIncrement(),
      readAndIncrement(),
      readAndIncrement(),
      readAndIncrement(),
    ]);

    const finalValue = scope.accessor(counter).get();
    expect(finalValue).toBe(1);
  }, 10000);

  test("demonstrates race with multiple concurrent readers and writers", async () => {
    const state = provide(() => ({ counter: 0, sum: 0 }), name("state"));
    const scope = createScope();
    await scope.resolve(state);

    const operations = [
      scope.update(state, (s) => ({
        ...s,
        counter: s.counter + 1,
        sum: s.sum + s.counter,
      })),
      scope.update(state, (s) => ({
        ...s,
        counter: s.counter + 1,
        sum: s.sum + s.counter,
      })),
      scope.update(state, (s) => ({
        ...s,
        counter: s.counter + 1,
        sum: s.sum + s.counter,
      })),
      scope.update(state, (s) => ({
        ...s,
        counter: s.counter + 1,
        sum: s.sum + s.counter,
      })),
    ];

    await Promise.all(operations);

    const finalState = scope.accessor(state).get();
    expect(finalState.counter).toBe(4);
    expect(finalState.sum).toBe(6);
  }, 5000);
});
